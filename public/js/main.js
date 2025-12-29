import { store, LS_KEY_SELECTED_SCRIPT, getHideCheckedLinesForRoom } from './state.js';
import * as api from './api.js';
import * as ui from './ui.js';
import * as socket from './socket.js';
import { toast } from './toast.js';

// Subscribe to state changes to update UI visibility
store.subscribe(() => {
  ui.updateVisibility();
});

// Initialize application
(async function init() {
  const userData = await api.fetchMe();
  if (store.state.me) {
    await loadRooms();

    // Check if there's a room ID in the URL
    const urlRoomId = getRoomIdFromUrl();
    if (urlRoomId) {
      // Verify the room exists in our loaded rooms before joining
      const roomOption = Array.from(ui.elements.roomSelect.options).find(opt => opt.value === urlRoomId);
      if (roomOption) {
        ui.elements.roomSelect.value = urlRoomId;
        await joinRoom(urlRoomId);
      } else {
        console.warn(`Room ${urlRoomId} not found or not accessible`);
        clearRoomFromUrl();
      }
    }
  }
})();

// Event Listeners
ui.elements.loginBtn.addEventListener("click", () => {
  window.location.href = "/auth/login";
});

// Handle center login button (on auth screen)
const loginCenterBtn = document.getElementById('loginCenterBtn');
if (loginCenterBtn) {
  loginCenterBtn.addEventListener("click", () => {
    window.location.href = "/auth/login";
  });
}

ui.elements.logoutBtn.addEventListener("click", async () => {
  await api.logout();
  window.location.reload();
});

if (ui.elements.leaderboardBtn) {
  ui.elements.leaderboardBtn.addEventListener('click', async () => {
    if (!store.state.currentRoomId) return toast.warn('Please select a Test Fest first');
    try {
      const entries = await api.fetchLeaderboard(store.state.currentRoomId);
      ui.showLeaderboardDialog(entries);
    } catch (error) {
      toast.error(`Failed to load leaderboard: ${error.message}`);
    }
  });
}

ui.elements.createRoomBtn.addEventListener("click", async () => {
  const scriptLibrary = await api.fetchScriptLibrary();
  ui.showCreateRoomModal(scriptLibrary, async (data, closeModal) => {
    try {
      const created = await api.createRoom(data);
      closeModal();
      await loadRooms();
      if (created && created.id) {
        ui.elements.roomSelect.value = created.id;
        await joinRoom(created.id);
      }
    } catch (error) {
      toast.error(`Failed to create room: ${error.message}`);
    }
  });
});

ui.elements.changeRoomBtn.addEventListener("click", async () => {
  store.setState({
    currentRoomId: null,
    currentRoomNameValue: null,
    isGroupier: false,
  });
  ui.updateUserInfoDisplay();
  clearRoomFromUrl();

  try {
    localStorage.removeItem(LS_KEY_LAST_ROOM);
  } catch (_) { }

  socket.disconnectSocket();
  await loadRooms();
  // ui.updateVisibility() is called by subscription
});

ui.elements.roomSelect.addEventListener("change", async () => {
  if (ui.elements.roomSelect.value) {
    await joinRoom(ui.elements.roomSelect.value);
  }
});

ui.elements.issueForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!store.state.currentRoomId) return toast.warn("Please select a Test Fest first");

  const scriptIdEl = document.getElementById("scriptId");
  const scriptVal = (scriptIdEl?.value || "").trim();
  if (!scriptVal) {
    toast.warn("Script ID is required");
    return;
  }
  if (!/^\d+$/.test(scriptVal)) {
    toast.warn("Test Script ID must be a numeric value");
    return;
  }

  const descVal = (document.getElementById("description").value || "").trim();
  if (!descVal) {
    toast.warn("Issue Description is required");
    return;
  }

  const formData = new FormData(ui.elements.issueForm);
  try {
    await api.submitIssue(store.state.currentRoomId, formData);
    // Keep the selected script ID; clearing it forces re-selection and triggers the numeric warning.
    const preservedScriptId = scriptVal;
    ui.elements.issueForm.reset();
    if (scriptIdEl) scriptIdEl.value = preservedScriptId;
    toast.success("Issue submitted successfully");
  } catch (error) {
    toast.error(`Failed to submit: ${error.message}`);
  }
});

// Handle browser back/forward navigation
window.addEventListener('popstate', async (event) => {
  if (!store.state.me) return;

  const urlRoomId = getRoomIdFromUrl();
  if (urlRoomId && urlRoomId !== store.state.currentRoomId) {
    const roomOption = Array.from(ui.elements.roomSelect.options).find(opt => opt.value === urlRoomId);
    if (roomOption) {
      ui.elements.roomSelect.value = urlRoomId;
      await joinRoom(urlRoomId);
    } else {
      clearRoomFromUrl();
    }
  } else if (!urlRoomId && store.state.currentRoomId) {
    store.setState({
      currentRoomId: null,
      currentRoomNameValue: null,
      isGroupier: false,
    });
    socket.disconnectSocket();
    ui.elements.roomSelect.value = '';
    // ui.updateVisibility() is called by subscription
  }
});

// Helper Functions
async function loadRooms() {
  if (!store.state.me) return;
  const rooms = await api.fetchRooms();
  ui.populateRoomSelect(rooms);
  store.setState({
    currentRoomId: null,
    currentRoomNameValue: null,
  });
  // ui.updateVisibility() is called by subscription
}

async function joinRoom(roomId) {
  store.setState({ currentRoomId: roomId });

  // Restore per-room UI preferences (e.g., Hide checked lines)
  store.setState({ hideCheckedLines: getHideCheckedLinesForRoom(roomId) });

  const selectedOption = Array.from(ui.elements.roomSelect.options).find(opt => opt.value === roomId);
  store.setState({ currentRoomNameValue: selectedOption ? selectedOption.textContent : "Unknown Room" });

  const newUrl = `/fest/${roomId}`;
  if (window.location.pathname !== newUrl) {
    window.history.pushState({ roomId }, '', newUrl);
  }

  try {
    localStorage.setItem(LS_KEY_LAST_ROOM, roomId);
  } catch (_) { }

  socket.initSocket(roomId);

  try {
    const [issues, testScriptLines, joinData] = await Promise.all([
      api.fetchIssues(roomId),
      api.fetchTestScriptLines(roomId),
      api.joinRoomApi(roomId)
    ]);

    // Ensure test script lines are set before rendering issues so that
    // placeholders for lines without issues can be rendered immediately.
    store.setState({ testScriptLines });
    ui.renderIssues(issues);
    ui.renderTestScriptLines(true);

    store.setState({ isGroupier: !!(joinData && joinData.isGroupier) });
    ui.updateUserInfoDisplay();
  } catch (error) {
    console.error("Error joining room:", error);
  }

  // ui.updateVisibility() is called by subscription
}

function getRoomIdFromUrl() {
  const pathMatch = window.location.pathname.match(/^\/fest\/([a-f0-9-]{36})$/i);
  return pathMatch ? pathMatch[1] : null;
}

function clearRoomFromUrl() {
  if (window.location.pathname !== '/') {
    window.history.pushState({}, '', '/');
  }
}

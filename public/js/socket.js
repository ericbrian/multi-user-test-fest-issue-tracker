import { store } from './state.js';
import * as ui from './ui.js';
import * as api from './api.js';
import { showNotification } from './notifications.js';

export function initSocket(roomId, isGroupier = false) {
  if (store.state.socket) {
    store.state.socket.disconnect();
  }

  // Assuming io is available globally via the script tag in index.html
  // If we were using a bundler, we would import it.
  // Since we are using native ES modules, we rely on the global `io` or we need to import it from a CDN or local file.
  // The original app.js assumed `io` was global.
  const socket = io();
  store.setState({ socket });

  const user = { ...store.state.me, isGroupier };
  store.state.socket.emit("room:join", { roomId, user });

  store.state.socket.on("room:users", (users) => {
    store.setState({ usersInRoom: users || [] });
    if (ui.renderActiveUsers) ui.renderActiveUsers();
  });

  store.state.socket.on("room:user_joined", (user) => {
    if (!user) return;
    const currentUsers = store.state.usersInRoom || [];
    // Avoid duplicates if user is already in list (e.g. multiple tabs)
    if (!currentUsers.find(u => u.id === user.id)) {
      const updated = [...currentUsers, user];
      store.setState({ usersInRoom: updated });
      if (ui.renderActiveUsers) ui.renderActiveUsers();
      showNotification('success', 'New tester', `${user.name || user.email} joined the Test Fest`);
    }
  });

  store.state.socket.on("room:user_left", (userId) => {
    if (!userId) return;
    const currentUsers = store.state.usersInRoom || [];
    const updated = currentUsers.filter(u => u.id !== userId);
    store.setState({ usersInRoom: updated });
    if (ui.renderActiveUsers) ui.renderActiveUsers();
  });

  store.state.socket.on("issue:new", (payload) => {
    try {
      const who = payload && (payload.created_by_name || payload.created_by_email) ? ` by ${payload.created_by_name || payload.created_by_email}` : '';
      showNotification('info', 'New issue', `New issue reported${who}`);
    } catch (e) { /* non-fatal */ }
    refreshIssues(roomId);
  });

  store.state.socket.on("issue:update", (payload) => {
    try {
      showNotification('info', 'Issue updated', payload && payload.status ? `Status: ${payload.status}` : 'An issue was updated');
    } catch (e) { /* non-fatal */ }
    refreshIssues(roomId);
  });

  store.state.socket.on("testScriptLine:progress", (payload) => {
    const line = store.state.testScriptLines.find(l => l.id === payload.lineId);
    if (line) {
      line.is_checked = payload.is_checked;
      line.checked_at = payload.checked_at;
      line.progress_notes = payload.notes;
      ui.renderTestScriptLines();
      try {
        const actor = payload && payload.userId && store.state.me && payload.userId === store.state.me.id ? 'You' : 'A tester';
        const msg = payload && payload.is_checked
          ? `${actor} checked off a test script line`
          : `${actor} unchecked a test script line`;
        showNotification('success', 'Test progress', msg);
      } catch (e) { /* ignore */ }
    }
  });

  store.state.socket.on("issue:delete", (payload) => {
    try {
      showNotification('warn', 'Issue deleted', payload && payload.id ? `Issue ${payload.id} was removed` : 'An issue was removed');
    } catch (e) { /* ignore */ }
    if (payload && payload.id) {
      ui.removeIssueElement(payload.id);
    } else {
      refreshIssues(roomId);
    }
  });
}

export function disconnectSocket() {
  if (store.state.socket) {
    store.state.socket.disconnect();
    store.setState({ socket: null });
  }
}

async function refreshIssues(roomId) {
  try {
    const issues = await api.fetchIssues(roomId);
    ui.renderIssues(issues);
  } catch (error) {
    console.error("Error refreshing issues:", error);
  }
}

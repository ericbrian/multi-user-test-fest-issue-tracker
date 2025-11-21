import { store } from './state.js';
import * as ui from './ui.js';
import * as api from './api.js';

export function initSocket(roomId) {
  if (store.state.socket) {
    store.state.socket.disconnect();
  }

  // Assuming io is available globally via the script tag in index.html
  // If we were using a bundler, we would import it.
  // Since we are using native ES modules, we rely on the global `io` or we need to import it from a CDN or local file.
  // The original app.js assumed `io` was global.
  const socket = io();
  store.setState({ socket });

  store.state.socket.emit("room:join", roomId);

  store.state.socket.on("issue:new", () => refreshIssues(roomId));
  store.state.socket.on("issue:update", () => refreshIssues(roomId));

  store.state.socket.on("testScriptLine:progress", (payload) => {
    const line = store.state.testScriptLines.find(l => l.id === payload.lineId);
    if (line) {
      line.is_checked = payload.is_checked;
      line.checked_at = payload.checked_at;
      line.progress_notes = payload.notes;
      ui.renderTestScriptLines();
    }
  });

  store.state.socket.on("issue:delete", (payload) => {
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

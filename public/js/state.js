class Store {
  constructor(initialState = {}) {
    this._state = initialState;
    this._listeners = new Set();
  }

  get state() {
    return this._state;
  }

  setState(newState) {
    this._state = { ...this._state, ...newState };
    this.notify();
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  notify() {
    this._listeners.forEach(listener => listener(this._state));
  }
}

const initialState = {
  me: null,
  tags: [],
  currentRoomId: null,
  currentRoomNameValue: null,
  socket: null,
  isGroupier: false,
  testScriptLines: [],
  hideCheckedLines: false,
  issuesFilter: 'all',
  jiraBaseUrl: null,
};

export const store = new Store(initialState);
export const LS_KEY_LAST_ROOM = "tft:lastRoomId";
export const LS_KEY_SELECTED_SCRIPT = "tft:selectedScriptId";
export const LS_KEY_HIDE_CHECKED_BY_ROOM = "tft:hideCheckedLinesByRoom";

export function getHideCheckedLinesForRoom(roomId) {
  if (!roomId) return false;
  try {
    const raw = localStorage.getItem(LS_KEY_HIDE_CHECKED_BY_ROOM);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return false;
    return Boolean(parsed[roomId]);
  } catch (_) {
    return false;
  }
}

export function setHideCheckedLinesForRoom(roomId, value) {
  if (!roomId) return;
  try {
    const raw = localStorage.getItem(LS_KEY_HIDE_CHECKED_BY_ROOM);
    let parsed = {};
    if (raw) {
      const maybe = JSON.parse(raw);
      if (maybe && typeof maybe === 'object') parsed = maybe;
    }
    parsed[roomId] = Boolean(value);
    localStorage.setItem(LS_KEY_HIDE_CHECKED_BY_ROOM, JSON.stringify(parsed));
  } catch (_) {
    // ignore storage errors
  }
}

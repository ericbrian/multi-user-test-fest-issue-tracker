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
  jiraBaseUrl: null,
};

export const store = new Store(initialState);
export const LS_KEY_LAST_ROOM = "tft:lastRoomId";

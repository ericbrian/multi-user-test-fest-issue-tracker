export const state = {
  me: null,
  tags: [],
  currentRoomId: null,
  currentRoomNameValue: null,
  socket: null,
  isGroupier: false,
  testScriptLines: [],
  jiraBaseUrl: null,
};

export const LS_KEY_LAST_ROOM = "tft:lastRoomId";

export function setState(newState) {
  Object.assign(state, newState);
}

import { state, setState } from './state.js';

export async function fetchMe() {
  try {
    const res = await fetch("/me");
    const data = await res.json();
    setState({
      me: data.user,
      tags: data.tags || [],
      jiraBaseUrl: data.jiraBaseUrl || null,
    });
    return data;
  } catch (error) {
    console.error("Error fetching user info:", error);
    return null;
  }
}

export async function fetchRooms() {
  try {
    const res = await fetch("/api/rooms");
    if (!res.ok) throw new Error("Failed to fetch rooms");
    return await res.json();
  } catch (error) {
    console.error("Error fetching rooms:", error);
    return [];
  }
}

export async function fetchScriptLibrary() {
  try {
    const res = await fetch('/api/script-library');
    if (res.ok) {
      return await res.json();
    }
  } catch (error) {
    console.warn('Could not fetch script library:', error);
  }
  return [];
}

export async function createRoom(data) {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.text().catch(() => 'Unknown error');
    throw new Error(error);
  }
  return await res.json();
}

export async function joinRoomApi(roomId) {
  const res = await fetch("/api/rooms/" + roomId + "/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Failed to join room");
  return await res.json();
}

export async function fetchIssues(roomId) {
  const res = await fetch(`/api/rooms/${roomId}/issues`);
  if (!res.ok) throw new Error("Failed to fetch issues");
  return await res.json();
}

export async function fetchTestScriptLines(roomId) {
  const res = await fetch(`/api/rooms/${roomId}/test-script-lines`);
  if (!res.ok) throw new Error("Failed to fetch test script lines");
  return await res.json();
}

export async function updateTestScriptLineProgress(lineId, isChecked) {
  const res = await fetch(`/api/test-script-lines/${lineId}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_checked: isChecked })
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to update progress');
  }
  return await res.json();
}

export async function updateIssueStatus(id, status, roomId) {
  const res = await fetch(`/api/issues/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, roomId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to set status");
  }
  return await res.json();
}

export async function sendToJira(id, roomId) {
  const res = await fetch(`/api/issues/${id}/jira`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId }),
  });
  if (!res.ok) throw new Error("Failed to create Jira issue");
  return await res.json();
}

export async function deleteIssue(id) {
  const res = await fetch(`/api/issues/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
  return true;
}

export async function submitIssue(roomId, formData) {
  const res = await fetch(`/api/rooms/${roomId}/issues`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const details = data.error || data.message;
    throw new Error(details || await res.text().catch(() => "Unknown error"));
  }
  return await res.json();
}

export async function logout() {
  await fetch("/auth/logout", { method: "POST" });
}

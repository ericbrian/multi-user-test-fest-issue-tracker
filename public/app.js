const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userInfo = document.getElementById('userInfo');
const issueForm = document.getElementById('issueForm');
const issuesEl = document.getElementById('issues');
const roomSelect = document.getElementById('roomSelect');
const createRoomBtn = document.getElementById('createRoomBtn');
const tagLegend = document.getElementById('tagLegend');

let me = null;
let tags = [];
let currentRoomId = null;
let socket = null;
const LS_KEY_LAST_ROOM = 'tft:lastRoomId';

function updateVisibility() {
  const shouldShow = Boolean(currentRoomId);
  issueForm.classList.toggle('hidden', !shouldShow);
  issuesEl.classList.toggle('hidden', !shouldShow);
  tagLegend.classList.toggle('hidden', !shouldShow);
  if (createRoomBtn) {
    createRoomBtn.style.display = shouldShow ? 'none' : 'inline-block';
  }
}

async function fetchMe() {
  const res = await fetch('/me');
  const data = await res.json();
  me = data.user;
  tags = data.tags || [];
  if (data.jiraBaseUrl) {
    window.__jiraBaseUrl = data.jiraBaseUrl;
  }
  userInfo.textContent = me ? `${me.name || me.email || 'User'}` : 'Not logged in';
  loginBtn.style.display = me ? 'none' : 'inline-block';
  logoutBtn.style.display = me ? 'inline-block' : 'none';

  tagLegend.innerHTML = '';
  tags.forEach(t => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = t;
    tagLegend.appendChild(span);
  });
  updateVisibility();
}

async function loadRooms() {
  if (!me) return;
  const res = await fetch('/api/rooms');
  if (!res.ok) return;
  const rooms = await res.json();
  roomSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— Select a room —';
  placeholder.disabled = true;
  placeholder.selected = true;
  roomSelect.appendChild(placeholder);
  rooms.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id; opt.textContent = `${r.name}`;
    roomSelect.appendChild(opt);
  });
  currentRoomId = null;
  updateVisibility();
}

async function createRoom() {
  const name = prompt('Room name?') || '';
  const res = await fetch('/api/rooms', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
  });
  if (res.ok) {
    const created = await res.json();
    await loadRooms();
    if (created && created.id) {
      roomSelect.value = created.id;
      await joinRoom(created.id);
    }
  }
}

async function joinRoom(roomId) {
  currentRoomId = roomId;
  try { localStorage.setItem(LS_KEY_LAST_ROOM, roomId); } catch (_) { }
  if (socket) socket.disconnect();
  socket = io();
  socket.emit('room:join', roomId);
  socket.on('issue:new', () => fetchIssues(currentRoomId));
  socket.on('issue:update', () => fetchIssues(currentRoomId));
  socket.on('issue:delete', (payload) => {
    if (payload && payload.id) {
      const el = document.getElementById(issueElementId(payload.id));
      if (el && el.parentElement) {
        el.parentElement.removeChild(el);
      }
    } else {
      fetchIssues(currentRoomId);
    }
  });
  await fetchIssues(roomId);
  await fetch('/api/rooms/' + roomId + '/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  updateVisibility();
}

async function fetchIssues(roomId) {
  const res = await fetch(`/api/rooms/${roomId}/issues`);
  const list = await res.json();
  issuesEl.innerHTML = '';
  list.forEach(i => addOrUpdateIssue(i, true));
}

function issueElementId(id) { return `issue-${id}`; }

function addOrUpdateIssue(issue, isInitial = false) {
  let el = document.getElementById(issueElementId(issue.id));
  const isFaded = Boolean(issue.status) && issue.status !== 'open';
  const isMine = me && issue.created_by && issue.created_by === me.id;
  if (!el) {
    el = document.createElement('div');
    el.className = 'issue' + (isInitial ? '' : ' enter');
    el.id = issueElementId(issue.id);
    issuesEl.prepend(el);
  }
  el.className = 'issue' + (isFaded ? ' fade' : '') + (isMine ? '' : ' not-mine');
  const imgs = (issue.images || []).map(src => `<img src="${src}" />`).join('');
  const statusTag = issue.status && issue.status !== 'open' ? `<span class="tag">${issue.status}</span>` : '';
  const jiraTag = issue.jira_key ? `<span class="tag">Jira: ${issue.jira_key}</span>` : '';
  const reasons = [];
  if (issue.is_issue) reasons.push('Issue');
  if (issue.is_existing_upper_env) reasons.push('Issue in Production');
  if (issue.is_annoyance) reasons.push('Annoyance');
  if (issue.is_not_sure_how_to_test) reasons.push('Not sure how to test');
  const reasonsHtml = reasons.length
    ? `<div class="dimmable" style="margin-top:6px;"><span class="footer-label">Reasons:</span> <span class="tags">${reasons.map(r => `<span class=\"tag\">${r}</span>`).join('')}</span></div>`
    : '';
  el.innerHTML = `
    <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px;">
      <div class="dimmable" style="flex: 1 1 auto;"><strong>Test Script ID:</strong> ${issue.script_id || ''} ${statusTag} ${jiraTag}</div>
      <div class="dimmable" style="color: var(--muted); font-size: 12px;">
        By: ${issue.created_by_name || issue.created_by_email || 'Unknown'}
      </div>
    </div>
    <div class="dimmable" style="margin-top:6px;">${issue.description || ''}</div>
    ${reasonsHtml}
    <div class="images dimmable">${imgs}</div>
    ${me ? renderActionBar(issue) : ''}
  `;
  el.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', onIssueButtonClick);
  });
  el.querySelectorAll('.images img').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.getAttribute('src')));
  });
}

function renderTagButtons(issue) {
  return `<div style="margin-top:8px; display:flex; gap:8px; flex-wrap: wrap; align-items: center;">
    <span style="color: var(--muted); font-size: 12px;">Status:</span>
    ${tags.map(t => `<button class=\"btn-tag ${issue.status === t ? 'active' : ''}\" data-action=\"setStatus\" data-tag=\"${t}\" data-id=\"${issue.id}\">${t}</button>`).join('')}
  </div>`;
}

function renderTagButtonsInline(issue) {
  return `<div style=\"display:flex; gap:6px; align-items:center;\">
    <span style=\"color: var(--muted); font-size: 12px;\">Status:</span>
    ${tags.map(t => `<button class=\"btn-tag\" data-action=\"setStatus\" data-tag=\"${t}\" data-id=\"${issue.id}\">${t}</button>`).join('')}
  </div>`;
}

function renderActionBar(issue) {
  if (issue.jira_key) {
    const base = (window.__jiraBaseUrl || '').replace(/\/$/, '');
    const url = base && issue.jira_key ? `${base}/browse/${issue.jira_key}` : '#';
    return `
      <div class="issue-footer">
        <div class="jira-note">Issue is in Jira: <a href="${url}" target="_blank" rel="noopener noreferrer">${issue.jira_key}</a></div>
      </div>
    `;
  }
  return `
    <div class="issue-footer">
      <div class="issue-footer-left">
        ${renderTagButtonsInline(issue)}
      </div>
      <div class="issue-footer-right">
        <button class="btn-danger" data-action="delete" data-id="${issue.id}">Delete</button>
        <button class="btn-jira" data-action="toJira" data-id="${issue.id}">Send to Jira</button>
      </div>
    </div>
  `;
}

async function onIssueButtonClick(e) {
  const action = e.target.getAttribute('data-action');
  const id = e.target.getAttribute('data-id');
  if (action === 'setStatus') {
    const status = e.target.getAttribute('data-tag');
    await fetch(`/api/issues/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, roomId: currentRoomId }) });
  }
  if (action === 'toJira') {

    const res = await fetch(`/api/issues/${id}/jira`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: currentRoomId }) });
    if (res.ok) {
      const data = await res.json();
      alert('Created in Jira: ' + data.jira_key);
    } else {
      alert('Failed to create Jira issue');
    }
  }
  if (action === 'delete') {
    if (!confirm('Delete this issue?')) return;
    const res = await fetch(`/api/issues/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert('Failed to delete');
    }
  }
  if (action === 'clearStatus') {
    await fetch(`/api/issues/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'clear-status', roomId: currentRoomId }) });
  }
}

issueForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentRoomId) return alert('Select a room');
  const scriptVal = (document.getElementById('scriptId').value || '').trim();
  if (!/^\d+$/.test(scriptVal)) {
    alert('Test Script ID must be a numeric value');
    return;
  }
  const descVal = (document.getElementById('description').value || '').trim();
  if (!descVal) {
    alert('Issue Description is required');
    return;
  }
  const formData = new FormData(issueForm);
  const res = await fetch(`/api/rooms/${currentRoomId}/issues`, { method: 'POST', body: formData });
  if (res.ok) {
    issueForm.reset();
  } else {
    alert('Failed to submit');
  }
});

roomSelect.addEventListener('change', async () => {
  if (roomSelect.value) {
    await joinRoom(roomSelect.value);
  }
});

loginBtn.addEventListener('click', () => {
  window.location.href = '/auth/login';
});
logoutBtn.addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.reload();
});

createRoomBtn.addEventListener('click', createRoom);

(async function init() {
  await fetchMe();
  if (me) {
    await loadRooms();
  }
})();

function openLightbox(src) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.addEventListener('click', () => document.body.removeChild(overlay));
  const img = document.createElement('img');
  img.className = 'lightbox-img';
  img.src = src;
  overlay.appendChild(img);
  document.body.appendChild(overlay);
}


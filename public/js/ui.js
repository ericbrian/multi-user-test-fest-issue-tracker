import { store } from './state.js';
import * as api from './api.js';

// DOM Elements
export const elements = {
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  userInfoHeader: document.getElementById("userInfoHeader"),
  issueForm: document.getElementById("issueForm"),
  issuesEl: document.getElementById("issues"),
  roomSelect: document.getElementById("roomSelect"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  changeRoomBtn: document.getElementById("changeRoomBtn"),
  roomLabel: document.getElementById("roomLabel"),
  currentRoomName: document.getElementById("currentRoomName"),
  tagLegend: document.getElementById("tagLegend"),
  roomControls: document.querySelector(".room-controls"),
  loginNote: document.getElementById("loginNote"),
  testProgress: document.getElementById("testProgress"),
  progressText: document.getElementById("testProgress") ? document.getElementById("testProgress").querySelector(".progress-text") : null,
  progressFill: document.getElementById("testProgress") ? document.getElementById("testProgress").querySelector(".progress-fill") : null,
  testScriptLinesContainer: document.getElementById('testScriptLinesContainer'),
};

export function updateVisibility() {
  const isLoggedIn = Boolean(store.state.me);
  const shouldShow = Boolean(store.state.currentRoomId);

  if (elements.roomControls) elements.roomControls.style.display = isLoggedIn ? "block" : "none";
  if (elements.userInfoHeader) elements.userInfoHeader.style.display = isLoggedIn ? "inline-block" : "none";
  if (elements.loginNote) elements.loginNote.style.display = isLoggedIn ? "none" : "inline-block";

  elements.issueForm.classList.toggle("hidden", !shouldShow);
  elements.issuesEl.classList.toggle("hidden", !shouldShow);
  elements.tagLegend.classList.toggle("hidden", !shouldShow);

  // Handle test script lines container dynamically if it doesn't exist in initial DOM
  let container = document.getElementById('testScriptLinesContainer');
  if (container) {
    container.classList.toggle("hidden", !shouldShow);
  }

  if (elements.testProgress) {
    elements.testProgress.classList.toggle("hidden", !shouldShow);
  }

  document.querySelectorAll(".left-section").forEach((el) => {
    el.classList.toggle("hidden", !shouldShow);
  });

  if (elements.createRoomBtn) elements.createRoomBtn.style.display = shouldShow ? "none" : "inline-block";
  if (elements.roomSelect) elements.roomSelect.style.display = shouldShow ? "none" : "inline-block";
  if (elements.roomLabel) elements.roomLabel.style.display = shouldShow ? "none" : "inline-block";
  if (elements.changeRoomBtn) elements.changeRoomBtn.style.display = shouldShow ? "inline-block" : "none";

  if (elements.currentRoomName) {
    elements.currentRoomName.style.display = shouldShow ? "inline-block" : "none";
    const roomNameText = elements.currentRoomName.querySelector('.room-name-text');
    if (roomNameText) {
      roomNameText.textContent = store.state.currentRoomNameValue || "";
    }
  }

  if (elements.loginBtn) elements.loginBtn.style.display = store.state.me ? "none" : "inline-block";
  if (elements.logoutBtn) elements.logoutBtn.style.display = store.state.me ? "inline-block" : "none";
}

export function updateUserInfoDisplay() {
  if (!elements.userInfoHeader) return;

  if (!store.state.me) {
    elements.userInfoHeader.textContent = "";
    return;
  }

  const userName = store.state.me.name || store.state.me.email || "User";

  if (store.state.isGroupier) {
    elements.userInfoHeader.innerHTML = `<span class="groupier-bubble">You are the Groupier</span> &nbsp; ${userName}`;
  } else {
    elements.userInfoHeader.textContent = userName;
  }
}

export function renderTags() {
  elements.tagLegend.innerHTML = "";
  store.state.tags.forEach((t) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = t;
    elements.tagLegend.appendChild(span);
  });
}

export function populateRoomSelect(rooms) {
  elements.roomSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— Select a room —";
  placeholder.disabled = true;
  placeholder.selected = true;
  elements.roomSelect.appendChild(placeholder);
  rooms.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.name}`;
    elements.roomSelect.appendChild(opt);
  });
}

export function updateTestProgress() {
  const progressText = elements.testProgress ? elements.testProgress.querySelector(".progress-text") : null;
  const progressFill = elements.testProgress ? elements.testProgress.querySelector(".progress-fill") : null;

  if (!store.state.testScriptLines || !progressText || !progressFill) return;

  const totalTests = store.state.testScriptLines.length;
  const completedTests = store.state.testScriptLines.filter(line => line.is_checked).length;
  const percentage = totalTests > 0 ? (completedTests / totalTests) * 100 : 0;

  const testsWord = totalTests === 1 ? 'test' : 'tests';
  progressText.textContent = `${completedTests} of ${totalTests} ${testsWord} done`;
  progressFill.style.width = `${percentage}%`;
}

export function renderTestScriptLines(shouldAutoScroll = false) {
  let container = document.getElementById('testScriptLinesContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'testScriptLinesContainer';
    container.className = 'test-script-lines left-section';

    const issueFormSection = document.querySelector('.left-section');
    if (issueFormSection && issueFormSection.nextSibling) {
      issueFormSection.parentNode.insertBefore(container, issueFormSection.nextSibling);
    } else if (issueFormSection) {
      issueFormSection.parentNode.appendChild(container);
    } else {
      const leftPanel = document.querySelector('.left');
      if (leftPanel) {
        leftPanel.appendChild(container);
      }
    }
  }

  if (!store.state.testScriptLines || store.state.testScriptLines.length === 0) {
    container.innerHTML = `
      <div class="test-script-lines-title">Test Scripts</div>
      <div class="test-script-lines-empty">No test scripts available for this room.</div>
    `;
    return;
  }

  const linesHtml = store.state.testScriptLines.map(line => {
    const isChecked = line.is_checked;
    const checkedClass = isChecked ? 'checked' : '';
    const databaseNotesHtml = line.notes ?
      `<div class="test-script-line-db-notes">${formatNotesWithLineBreaks(line.notes)}</div>` : '';
    const progressNotesHtml = line.progress_notes ?
      `<div class="test-script-line-notes">${formatNotesWithLineBreaks(line.progress_notes)}</div>` : '';

    return `
      <div class="test-script-line ${checkedClass}" data-line-id="${line.id}" data-script-line-id="${line.test_script_line_id}">
        <input type="checkbox" class="test-script-line-checkbox" ${isChecked ? 'checked' : ''} />
        <div class="test-script-line-content">
          <div class="test-script-line-header">
            <span class="test-script-line-script-id">ID: ${line.test_script_line_id}</span>
            <span class="test-script-line-name">${escapeHtml(line.name)}</span>
          </div>
          ${line.description ? `<div class="test-script-line-description">${escapeHtml(line.description)}</div>` : ''}
          ${databaseNotesHtml}
          ${progressNotesHtml}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="test-script-lines-title">Test Script</div>
    ${linesHtml}
  `;

  container.querySelectorAll('.test-script-line').forEach(lineEl => {
    lineEl.addEventListener('click', onTestScriptLineClick);
  });
  container.querySelectorAll('.test-script-line-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', onTestScriptLineCheckboxClick);
  });

  if (shouldAutoScroll) {
    scrollToFirstUncheckedLine(container);
  }

  updateTestProgress();
}

function scrollToFirstUncheckedLine(container) {
  const hasCheckedItems = store.state.testScriptLines.some(line => line.is_checked);
  if (hasCheckedItems) {
    const firstUncheckedLine = container.querySelector('.test-script-line:not(.checked)');
    if (firstUncheckedLine && container) {
      setTimeout(() => {
        const containerRect = container.getBoundingClientRect();
        const lineRect = firstUncheckedLine.getBoundingClientRect();
        const relativeTop = lineRect.top - containerRect.top + container.scrollTop;
        container.scrollTo({ top: relativeTop, behavior: 'smooth' });
        firstUncheckedLine.style.transform = 'translateX(4px)';
        firstUncheckedLine.style.boxShadow = '0 2px 12px rgba(124, 58, 237, 0.3)';
        setTimeout(() => {
          firstUncheckedLine.style.transform = '';
          firstUncheckedLine.style.boxShadow = '';
        }, 1000);
      }, 100);
    }
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatNotesWithLineBreaks(text) {
  if (!text) return '';
  return text.split('|').map(part => {
    const trimmedPart = part.trim();
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const formattedPart = escapeHtml(trimmedPart).replace(urlRegex, (url) => {
      const cleanUrl = url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
    return formattedPart;
  }).join('<br>');
}

function onTestScriptLineClick(e) {
  if (e.target.type === 'checkbox') return;
  const lineEl = e.currentTarget;
  const scriptLineId = lineEl.getAttribute('data-script-line-id');
  const scriptIdInput = document.getElementById('scriptId');
  if (scriptIdInput) {
    scriptIdInput.value = scriptLineId;
    scriptIdInput.focus();
  }
}

async function onTestScriptLineCheckboxClick(e) {
  e.stopPropagation();
  const checkbox = e.target;
  const lineEl = checkbox.closest('.test-script-line');
  const lineId = lineEl.getAttribute('data-line-id');
  const isChecked = checkbox.checked;

  try {
    await api.updateTestScriptLineProgress(lineId, isChecked);
    if (isChecked) {
      lineEl.classList.add('checked');
    } else {
      lineEl.classList.remove('checked');
    }
    const line = store.state.testScriptLines.find(l => l.id === lineId);
    if (line) {
      line.is_checked = isChecked;
      line.checked_at = isChecked ? new Date().toISOString() : null;
    }
    updateTestProgress();
  } catch (error) {
    console.error('Error updating test script line progress:', error);
    checkbox.checked = !isChecked;
    alert(error.message);
  }
}

export function renderIssues(list) {
  const sortedList = list.sort((a, b) => {
    const scriptIdA = parseInt(a.script_id) || 0;
    const scriptIdB = parseInt(b.script_id) || 0;
    return scriptIdA - scriptIdB;
  });
  elements.issuesEl.innerHTML = "";
  sortedList.forEach((i) => addOrUpdateIssue(i, true));
}

export function addOrUpdateIssue(issue, isInitial = false) {
  let el = document.getElementById(`issue-${issue.id}`);
  const isFaded = Boolean(issue.status) && issue.status !== "open";
  const isMine = store.state.me && issue.created_by && issue.created_by === store.state.me.id;

  if (!el) {
    el = document.createElement("div");
    el.className = "issue" + (isInitial ? "" : " enter");
    el.id = `issue-${issue.id}`;
    insertIssueInSortedOrder(el, issue);
  }

  el.className = "issue" + (isFaded ? " fade" : "") + (isMine ? "" : " not-mine");
  el.setAttribute('data-script-id', issue.script_id || 0);

  const imgs = (issue.images || [])
    .map((src) => `<img src="${src}" />`)
    .join("");
  const statusTag = issue.status && issue.status !== "open"
      ? `<span class="tag">${issue.status}</span>`
      : "";
  const jiraTag = issue.jira_key
    ? `<span class="tag">Jira: ${issue.jira_key}</span>`
    : "";

  const reasons = [];
  if (issue.is_issue) reasons.push("New Issue");
  if (issue.is_existing_upper_env) reasons.push("Issue in Production");
  if (issue.is_annoyance) reasons.push("Annoyance");
  if (issue.is_not_sure_how_to_test) reasons.push("Not sure how to test");

  const label = reasons.length > 1 ? "Reasons for logging:" : "Reason for logging:";
  const reasonsHtml = reasons.length
    ? `<div class="dimmable" style="margin-top:6px;"><span class="footer-label">${label}</span> <span class="tags">${reasons
      .map((r) => `<span class=\"tag\">${r}</span>`)
      .join("")}</span></div>`
    : "";

  el.innerHTML = `
    <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px;">
      <div class="dimmable" style="flex: 1 1 auto;"><strong>Test Script ID:</strong> ${issue.script_id || ""} ${statusTag} ${jiraTag}</div>
      <div class="dimmable" style="color: var(--muted); font-size: 12px;">
        By: ${issue.created_by_name || issue.created_by_email || "Unknown"}
      </div>
    </div>
    <div class="dimmable" style="margin-top:6px;">${issue.description || ""}</div>
    ${reasonsHtml}
    <div class="images dimmable">${imgs}</div>
    ${store.state.me ? renderActionBar(issue) : ""}
  `;

  el.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", onIssueButtonClick);
  });
  el.querySelectorAll(".images img").forEach((img) => {
    img.addEventListener("click", () => openLightbox(img.getAttribute("src")));
  });
}

function insertIssueInSortedOrder(issueElement, issue) {
  const currentIssueScriptId = parseInt(issue.script_id) || 0;
  const existingIssues = Array.from(elements.issuesEl.children);
  let insertIndex = existingIssues.length;

  for (let i = 0; i < existingIssues.length; i++) {
    const existingScriptId = parseInt(existingIssues[i].getAttribute('data-script-id')) || 0;
    if (currentIssueScriptId < existingScriptId) {
      insertIndex = i;
      break;
    }
  }

  if (insertIndex >= existingIssues.length) {
    elements.issuesEl.appendChild(issueElement);
  } else {
    elements.issuesEl.insertBefore(issueElement, existingIssues[insertIndex]);
  }
}

function renderActionBar(issue) {
  if (issue.jira_key) {
    const base = (store.state.jiraBaseUrl || "").replace(/\/$/, "");
    const url = base && issue.jira_key ? `${base}/browse/${issue.jira_key}` : "#";
    return `
      <div class="issue-footer">
        <div class="jira-note">Issue is in Jira: <a href="${url}" target="_blank" rel="noopener noreferrer">${issue.jira_key}</a></div>
      </div>
    `;
  }

  const isMine = store.state.me && issue.created_by && issue.created_by === store.state.me.id;
  const canDelete = isMine || store.state.isGroupier;

  return `
    <div class="issue-footer">
      <div class="issue-footer-left">
        ${renderTagButtonsInline(issue)}
      </div>
      <div class="issue-footer-right">
        ${canDelete ? `<button class="btn-danger" data-action="delete" data-id="${issue.id}">Delete</button>` : ''}
        <button class="btn-jira" data-action="toJira" data-id="${issue.id}">Send to Jira</button>
      </div>
    </div>
  `;
}

function renderTagButtonsInline(issue) {
  const clearButton = issue.status && issue.status !== "open"
    ? `<button class="btn-tag" data-action="clearStatus" data-id="${issue.id}" title="Clear status">Clear</button>`
    : "";

  return `<div style=\"display:flex; gap:6px; align-items:center;\">
    <span style=\"color: var(--muted); font-size: 12px;\">Status:</span>
    ${store.state.tags
      .map(
        (t) =>
          `<button class=\"btn-tag\" data-action=\"setStatus\" data-tag=\"${t}\" data-id=\"${issue.id}\">${t}</button>`
      )
      .join("")}
    ${clearButton}
  </div>`;
}

async function onIssueButtonClick(e) {
  const action = e.target.getAttribute("data-action");
  const id = e.target.getAttribute("data-id");

  if (action === "setStatus") {
    const status = e.target.getAttribute("data-tag");
    try {
      await api.updateIssueStatus(id, status, store.state.currentRoomId);
    } catch (error) {
      alert(error.message);
    }
  }
  if (action === "toJira") {
    try {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = "Sending...";
      await api.sendToJira(id, store.state.currentRoomId);
      // The UI will update automatically via socket event
    } catch (error) {
      alert("Failed to create Jira issue: " + error.message);
      const btn = e.target;
      btn.disabled = false;
      btn.textContent = "Send to Jira";
    }
  }
  if (action === "delete") {
    if (!confirm("Are you sure you want to delete this issue? This action cannot be undone.")) return;
    try {
      await api.deleteIssue(id);
    } catch (error) {
      alert("Failed to delete");
    }
  }
  if (action === "clearStatus") {
    try {
      await api.updateIssueStatus(id, "clear-status", store.state.currentRoomId);
    } catch (error) {
      console.error(error);
    }
  }
}

export function openLightbox(src) {
  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  overlay.addEventListener("click", () => document.body.removeChild(overlay));
  const img = document.createElement("img");
  img.className = "lightbox-img";
  img.src = src;
  overlay.appendChild(img);
  document.body.appendChild(overlay);
}

export function removeIssueElement(id) {
  const el = document.getElementById(`issue-${id}`);
  if (el && el.parentElement) {
    el.parentElement.removeChild(el);
  }
}

export function showCreateRoomModal(scriptLibrary, onSubmit) {
  const modalHtml = `
    <div class="room-modal-overlay">
      <div class="room-modal">
        <div class="room-modal-header">
          <h2>Create New Test Fest</h2>
          <button class="room-modal-close" id="closeModalBtn">&times;</button>
        </div>
        <div class="room-modal-body">
          <form id="createRoomForm">
            <div class="form-group">
              <label for="roomName">Test Fest Name *</label>
              <input type="text" id="roomName" name="roomName" required
                     placeholder="e.g., Mobile App Testing, Website Redesign" />
            </div>

            <div class="form-group">
              <label for="roomDescription">Description (optional)</label>
              <textarea id="roomDescription" name="roomDescription" rows="3"
                        placeholder="Optional description of what will be tested"></textarea>
            </div>

            <div class="form-group">
              <label for="scriptSelection">Test Script Template</label>
              <select id="scriptSelection" name="scriptSelection">
                <option value="">Create empty script (add tests later)</option>
                ${scriptLibrary.map(script => `
                  <option value="${script.id}">
                    ${script.name} ${script.category ? `(${script.category})` : ''}
                    - ${script.line_count} test${script.line_count !== 1 ? 's' : ''}
                  </option>
                `).join('')}
              </select>
              <small class="form-help">Choose a pre-built test script or start with an empty script</small>
            </div>

            <div class="form-actions">
              <button type="button" id="cancelModalBtn">Cancel</button>
              <button type="submit">Create Test Fest</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);

  setTimeout(() => {
    document.getElementById('roomName').focus();
  }, 100);

  const closeModal = () => {
    if (modalContainer.parentElement) {
      modalContainer.parentElement.removeChild(modalContainer);
    }
  };

  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeModal);

  document.getElementById('createRoomForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('roomName').trim(),
      description: formData.get('roomDescription').trim() || null,
      scriptId: formData.get('scriptSelection') || null,
    };

    if (!data.name) {
      alert('Test Fest Name is required');
      return;
    }

    await onSubmit(data, closeModal);
  });
}

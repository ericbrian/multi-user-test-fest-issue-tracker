import { store, LS_KEY_SELECTED_SCRIPT } from './state.js';
import * as api from './api.js';
import { toast } from './toast.js';

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
  imagesInput: document.getElementById('images'),
  issuesFilter: document.getElementById('issuesFilter'),
};

// Cache last rendered issues list so toggling placeholders can re-render locally
let _lastRenderedIssues = [];

export function updateVisibility() {
  const isLoggedIn = Boolean(store.state.me);
  const inRoom = Boolean(store.state.currentRoomId);

  // Convenience flag for UI areas that should be visible when the user
  // is inside a room. Historically this was `shouldShow` but it wasn't
  // defined, causing a ReferenceError; derive it from `inRoom` here.
  const shouldShow = inRoom;

  // Header controls
  if (elements.roomControls) elements.roomControls.style.display = isLoggedIn ? "block" : "none";
  if (elements.userInfoHeader) elements.userInfoHeader.style.display = isLoggedIn ? "inline-block" : "none";
  if (elements.loginNote) elements.loginNote.style.display = isLoggedIn ? "none" : "inline-block";

  // Main panels only visible when user is in a room
  elements.issueForm.classList.toggle("hidden", !inRoom);
  elements.issuesEl.classList.toggle("hidden", !inRoom);
  elements.tagLegend.classList.toggle("hidden", !inRoom);

  // Handle test script lines container dynamically if it doesn't exist in initial DOM
  let container = document.getElementById('testScriptLinesContainer');
  if (container) {
    container.classList.toggle("hidden", !shouldShow);
  }

  if (elements.testProgress) {
    elements.testProgress.classList.toggle("hidden", !shouldShow);
  }

  // (In-panel auth placeholders removed) — use centered auth and room chooser.

  // Hide main layout and show centered auth box when not logged in
  const layoutEl = document.querySelector('.layout');
  if (layoutEl) layoutEl.style.display = inRoom ? 'flex' : 'none';

  const authCenter = document.getElementById('authCenter');
  if (authCenter) authCenter.classList.toggle('hidden', isLoggedIn);

  // Show the room chooser when logged in but not in a room
  const roomChooser = document.getElementById('roomChooserCenter');
  if (roomChooser) roomChooser.classList.toggle('hidden', !(isLoggedIn && !inRoom));

  // left-section wrapper removed; visibility is controlled on the form itself

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
    elements.userInfoHeader.innerHTML = `<span class="groupier-bubble" id="groupierBubble" role="button" tabindex="0" title="Click to learn what this means">You are the Groupier</span> &nbsp; ${userName}`;

    // Add click listener for explanation
    setTimeout(() => {
      const bubble = document.getElementById('groupierBubble');
      if (bubble) {
        bubble.addEventListener('click', showGroupierExplanationDialog);
      }
    }, 0);
  } else {
    elements.userInfoHeader.textContent = userName;
  }
}

function showGroupierExplanationDialog() {
  const modalHtml = `
    <div class="room-modal-overlay">
      <div class="room-modal">
        <div class="room-modal-header">
          <h2>Groupier Role</h2>
          <button class="room-modal-close" id="closeGroupierModalBtn">&times;</button>
        </div>
        <div class="room-modal-body">
          <p><strong>You are the current Groupier for this Test Fest.</strong></p>
          <p>As a Groupier, you have special responsibilities:</p>
          <ul style="margin-bottom: 1rem; padding-left: 1.5rem;">
            <li>You lead the testing session.</li>
            <li>You can <strong>delete issues</strong> reported by anyone.</li>
            <li>You can <strong>update the status</strong> of issues using tags.</li>
            <li>You should guide testers through the script and facilitate discussion.</li>
          </ul>
          <div class="form-actions" style="justify-content: flex-end;">
            <button type="button" id="closeGroupierDialogBtn">Got it</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);

  const closeModal = () => {
    if (modalContainer.parentElement) {
      modalContainer.parentElement.removeChild(modalContainer);
    }
  };

  document.getElementById('closeGroupierModalBtn').addEventListener('click', closeModal);
  document.getElementById('closeGroupierDialogBtn').addEventListener('click', closeModal);
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
  placeholder.textContent = "— Select a Test —";
  placeholder.disabled = true;
  placeholder.selected = true;
  elements.roomSelect.appendChild(placeholder);
  rooms.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.name}`;
    elements.roomSelect.appendChild(opt);
  });

  // Also populate the chooser select if present
  const chooser = document.getElementById('roomChooserSelect');
  if (chooser) {
    chooser.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '— Select a Test —';
    ph.disabled = true;
    ph.selected = true;
    chooser.appendChild(ph);
    rooms.forEach((r) => {
      const o = document.createElement('option');
      o.value = r.id;
      o.textContent = `${r.name}`;
      chooser.appendChild(o);
    });
    // Enable join button when rooms are available
    const joinBtn = document.getElementById('roomChooserJoinBtn');
    if (joinBtn) {
      joinBtn.disabled = rooms.length === 0;
    }
  }
}



export function renderTestScriptLines(shouldAutoScroll = false) {
  let container = document.getElementById('testScriptLinesContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'testScriptLinesContainer';
    container.className = 'test-script-lines';

    // Try to insert the test script container just above the description
    // label inside the issue form so it appears directly before the
    // issue description field.
    const issueForm = document.getElementById('issueForm');
    if (issueForm) {
      const descLabel = issueForm.querySelector('label[for="description"]');
      if (descLabel && descLabel.parentNode) {
        descLabel.parentNode.insertBefore(container, descLabel);
      } else {
        // If label not found, append to the top of the form
        issueForm.insertBefore(container, issueForm.firstChild);
      }
    } else {
      // Fallbacks: try the left topbar first, then the left panel
      const leftTopbar = document.querySelector('.left .topbar');
      if (leftTopbar) {
        leftTopbar.appendChild(container);
      } else {
        const leftPanel = document.querySelector('.left');
        if (leftPanel) leftPanel.appendChild(container);
      }
    }
  }

  if (!store.state.testScriptLines || store.state.testScriptLines.length === 0) {
    // Ensure the title sits above the container as a separate element
    ensureTestScriptTitle(container.parentNode, 'Test Scripts');
    container.innerHTML = `
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

  // Ensure the title sits above the container as a separate element
  ensureTestScriptTitle(container.parentNode, 'Test Script');
  container.innerHTML = `${linesHtml}`;

  // If a scriptId is already set (hidden input), mark that line as selected
  // If a scriptId is already set (hidden input), mark that line as selected.
  // If not present in the input, try to restore from localStorage (persisted selection).
  let currentScriptId = (document.getElementById('scriptId') || {}).value || null;
  if (!currentScriptId) {
    try {
      currentScriptId = localStorage.getItem(LS_KEY_SELECTED_SCRIPT) || null;
      if (currentScriptId) {
        const scriptInput = document.getElementById('scriptId');
        if (scriptInput) scriptInput.value = currentScriptId;
      }
    } catch (e) {
      currentScriptId = null;
    }
  }

  if (currentScriptId) {
    setTimeout(() => {
      const selectedEl = container.querySelector(`.test-script-line[data-script-line-id="${currentScriptId}"]`);
      if (selectedEl) {
        selectedEl.classList.add('selected');
        // Update the visible badge for the selected script
        updateSelectedScriptBadge(currentScriptId);
      } else {
        // Selection might be from another room; clear it to avoid confusing/stale UI.
        const scriptInput = document.getElementById('scriptId');
        if (scriptInput) scriptInput.value = '';
        updateSelectedScriptBadge(null);
        try { localStorage.removeItem(LS_KEY_SELECTED_SCRIPT); } catch (e) { /* ignore */ }
      }
    }, 0);
  }

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

// Ensure there's a title element for test scripts placed immediately
// before the container. If one already exists, update its text.
function ensureTestScriptTitle(insertParent, text) {
  if (!insertParent) return;
  // If a dedicated title element exists, update it
  let titleEl = document.getElementById('testScriptLinesTitle');
  if (titleEl) {
    // Update text but preserve the progress bar if it exists
    const progressBar = titleEl.querySelector('#testProgress');
    titleEl.innerHTML = '';
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    titleEl.appendChild(textSpan);
    let prog = progressBar;
    if (!prog) {
      // Create progress bar inside title
      prog = document.createElement('div');
      prog.id = 'testProgress';
      prog.className = 'test-progress';
      prog.innerHTML = `
        <span class="progress-text">0 of 0 tests done</span>
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
      `;
    }
    titleEl.appendChild(prog);
    // keep a reference on the exported elements map so other code can find it
    try { elements.testProgress = prog; } catch (e) { /* ignore */ }
    // make sure it's directly before our container
    const container = document.getElementById('testScriptLinesContainer');
    if (container && titleEl.nextElementSibling !== container) {
      insertParent.insertBefore(titleEl, container);
    }
    return;
  }

  titleEl = document.createElement('div');
  titleEl.id = 'testScriptLinesTitle';
  titleEl.className = 'test-script-lines-title';
  const textSpan = document.createElement('span');
  textSpan.textContent = text;
  titleEl.appendChild(textSpan);
  // Create progress bar inside title
  const prog = document.createElement('div');
  prog.id = 'testProgress';
  prog.className = 'test-progress';
  prog.innerHTML = `
    <span class="progress-text">0 of 0 tests done</span>
    <div class="progress-bar">
      <div class="progress-fill"></div>
    </div>
  `;
  titleEl.appendChild(prog);
  try { elements.testProgress = prog; } catch (e) { /* ignore */ }
  // insert before the container if present, otherwise append to parent
  const container = document.getElementById('testScriptLinesContainer');
  if (container) {
    insertParent.insertBefore(titleEl, container);
  } else {
    insertParent.appendChild(titleEl);
  }
}

export function updateTestProgress() {
  // Locate the progress element dynamically (it may be created after module load)
  const progressEl = document.getElementById('testProgress') || elements.testProgress || null;
  const progressText = progressEl ? progressEl.querySelector('.progress-text') : null;
  const progressFill = progressEl ? progressEl.querySelector('.progress-fill') : null;

  if (!store.state.testScriptLines || !progressText || !progressFill) return;

  const totalTests = store.state.testScriptLines.length;
  const completedTests = store.state.testScriptLines.filter(line => line.is_checked).length;
  const percentage = totalTests > 0 ? (completedTests / totalTests) * 100 : 0;

  progressText.textContent = `${completedTests} of ${totalTests} tests done`;
  progressFill.style.width = `${percentage}%`;
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
  }

  // Update visual selection state
  const container = document.getElementById('testScriptLinesContainer');
  if (container) {
    container.querySelectorAll('.test-script-line.selected').forEach(el => el.classList.remove('selected'));
    lineEl.classList.add('selected');
  }
  // Update visible badge with the chosen script ID
  updateSelectedScriptBadge(scriptLineId);

  // Persist selection so it can be restored across reloads
  try {
    localStorage.setItem(LS_KEY_SELECTED_SCRIPT, scriptLineId);
  } catch (err) {
    // ignore storage errors
  }

  // Scroll the right-hand issues panel to the item matching this script ID
  try {
    const issuesContainer = elements.issuesEl || document.getElementById('issues');
    if (issuesContainer) {
      const target = issuesContainer.querySelector(`.issue[data-script-id="${scriptLineId}"]`);
      if (target) {
        // Smooth-scroll into view within the issues container
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Briefly highlight the target so the user sees the match
        target.classList.add('scroll-highlight');
        setTimeout(() => {
          target.classList.remove('scroll-highlight');
        }, 1400);
      }
    }
  } catch (err) {
    console.error('Failed to scroll to matching issue:', err);
  }
}

export function updateSelectedScriptBadge(scriptId) {
  const badge = document.getElementById('selectedScriptBadge');
  if (!badge) return;
  if (scriptId) {
    badge.textContent = `#${scriptId}`;
    badge.style.display = 'inline-block';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
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
    toast.error(error.message);
  }
}

export function renderIssues(list) {
  const sortedList = (list || []).slice().sort((a, b) => {
    const scriptIdA = parseInt(a.script_id) || 0;
    const scriptIdB = parseInt(b.script_id) || 0;
    return scriptIdA - scriptIdB;
  });
  // Cache last list for re-render when toggles change
  _lastRenderedIssues = list || [];
  elements.issuesEl.innerHTML = "";
  // Apply issue-owner filtering ('all' | 'mine' | 'theirs') before rendering
  const filterMode = store.state.issuesFilter || 'all';
  let displayList = sortedList;
  if (filterMode === 'mine') {
    displayList = sortedList.filter(i => store.state.me && i.created_by && i.created_by === store.state.me.id);
  } else if (filterMode === 'theirs') {
    displayList = sortedList.filter(i => !(store.state.me && i.created_by && i.created_by === store.state.me.id));
  }

  displayList.forEach((i) => addOrUpdateIssue(i, true));

  // Add placeholders for test script lines that don't have an issue
  // If test script lines are available in state, show a placeholder
  // entry on the right for each line that isn't represented by an issue.
  try {
    const lines = store.state.testScriptLines || [];
    // Only render placeholders when showing the full list (no owner filter)
    if (store.state.issuesFilter !== 'all') return;
    if (lines && lines.length) {
      const issueScriptIds = new Set((list || []).map(x => String(x.script_id)));
      lines.forEach(line => {
        const scriptId = String(line.test_script_line_id);
        if (!issueScriptIds.has(scriptId)) {
          // Create a placeholder element and insert it in sorted order
          const placeholderId = `issue-placeholder-${scriptId}`;
          // Avoid duplicate placeholders if renderIssues called multiple times
          if (document.getElementById(placeholderId)) return;

          const el = document.createElement('div');
          el.id = placeholderId;
          el.className = 'issue placeholder not-mine';
          el.setAttribute('data-script-id', scriptId);
          el.innerHTML = `
            <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px;">
              <div class="dimmable" style="flex: 1 1 auto;"><strong>ID# ${scriptId}</strong> - No issue reported.</div>
              <div class="dimmable" style="color: var(--muted); font-size: 12px;">&nbsp;</div>
            </div>
          `;

          // Use the insert helper to place in sorted order
          insertIssueInSortedOrder(el, { script_id: scriptId });
        }
      });
    }
  } catch (err) {
    // Non-fatal; do not break issue rendering
    console.error('Error rendering placeholders for test script lines:', err);
  }
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
  if (issue.is_existing_upper_env) reasons.push("Issue already in Production");
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
      toast.error(error.message);
    }
  }
  if (action === "toJira") {
    try {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = "Sending...";
      await api.sendToJira(id, store.state.currentRoomId);
      // Optimistically mark the issue footer as 'sent to Jira' for immediate feedback.
      try {
        const issueEl = document.getElementById(`issue-${id}`);
        if (issueEl) {
          issueEl.classList.add('jira-sent');
          const footer = issueEl.querySelector('.issue-footer');
          if (footer) footer.classList.add('jira-sent');
        }
      } catch (err) { /* non-fatal */ }
      // Update the button to indicate success
      try {
        btn.textContent = "Sent";
        btn.disabled = true;
      } catch (err) { /* ignore */ }
      toast.success("Jira issue created successfully");
      // The UI will also update automatically via socket event
    } catch (error) {
      toast.error("Failed to create Jira issue: " + error.message);
      const btn = e.target;
      btn.disabled = false;
      btn.textContent = "Send to Jira";
    }
  }
  if (action === "delete") {
    if (!confirm("Are you sure you want to delete this issue? This action cannot be undone.")) return;
    try {
      await api.deleteIssue(id);
      toast.success("Issue deleted");
    } catch (error) {
      toast.error("Failed to delete");
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
      toast.warn('Test Fest Name is required');
      return;
    }

    await onSubmit(data, closeModal);
  });
}

// Wire up room chooser actions (join/create) if the elements are present
(() => {
  const joinBtn = document.getElementById('roomChooserJoinBtn');
  const chooser = document.getElementById('roomChooserSelect');
  if (joinBtn && chooser && elements.roomSelect) {
    joinBtn.addEventListener('click', () => {
      const val = chooser.value;
      if (!val) return toast.warn('Please select a test to join.');
      // propagate selection to the main room select which main.js listens to
      elements.roomSelect.value = val;
      elements.roomSelect.dispatchEvent(new Event('change'));
    });
  }

  const createBtn = document.getElementById('roomChooserCreateBtn');
  if (createBtn && elements.createRoomBtn) {
    createBtn.addEventListener('click', () => {
      elements.createRoomBtn.click();
    });
  }
})();

// Clear selected badge & selection when the issue form is reset
if (elements.issueForm) {
  elements.issueForm.addEventListener('reset', () => {
    // Preserve script selection across submits (main.js triggers a form reset after submit).
    // If you ever need an explicit "clear selection" action, handle it separately from reset.
  });
}

// ------------ Image drag & drop support ------------
// Allows users to drag images onto the `#images` file input to add files.
let _selectedFiles = [];

function syncInputFiles() {
  const input = elements.imagesInput || document.getElementById('images');
  if (!input) return;
  const dt = new DataTransfer();
  _selectedFiles.forEach(f => dt.items.add(f));
  input.files = dt.files;
}

function updateImagesPreview(fileList) {
  const files = fileList || _selectedFiles || [];
  let preview = document.getElementById('imagesPreview');
  const imagesInput = elements.imagesInput || document.getElementById('images');
  const dropzone = document.getElementById('imagesDropzone');
  if (!preview) {
    if (!imagesInput) return;
    preview = document.createElement('div');
    preview.id = 'imagesPreview';
    preview.className = 'images-preview';
    // Prefer to render previews inside the dropzone so they don't push
    // other form content (like the submit button) further down.
    if (dropzone) dropzone.appendChild(preview);
    else if (imagesInput.parentNode) imagesInput.parentNode.insertBefore(preview, imagesInput.nextSibling);
  }

  // Clear existing previews
  preview.innerHTML = '';
  if (!files || files.length === 0) return;

  files.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'images-preview-item';

    if (file.type && file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.className = 'images-preview-thumb';
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      item.appendChild(img);
    }

    const name = document.createElement('div');
    name.className = 'images-preview-name';
    name.textContent = file.name;
    item.appendChild(name);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'images-preview-remove';
    removeBtn.setAttribute('aria-label', `Remove ${file.name}`);
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      removeFileAtIndex(idx);
    });
    item.appendChild(removeBtn);

    preview.appendChild(item);
  });
}

function removeFileAtIndex(index) {
  if (index < 0 || index >= _selectedFiles.length) return;
  _selectedFiles.splice(index, 1);
  syncInputFiles();
  updateImagesPreview();
}

function enableImageDragDrop() {
  const input = elements.imagesInput || document.getElementById('images');
  const dropzone = document.getElementById('imagesDropzone');
  if (!input || !dropzone) return;

  // Hide the native button if it wasn't hidden already
  input.style.display = 'none';

  const setDragOver = (on) => {
    if (on) dropzone.classList.add('drag-over'); else dropzone.classList.remove('drag-over');
  };

  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  dropzone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    setDragOver(true);
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  });
  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    setDragOver(false);
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    setDragOver(false);
    const dt = e.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;

    // Filter to images only
    const files = Array.from(dt.files).filter(f => f.type && f.type.startsWith('image/'));
    if (files.length === 0) return;

    // Append (deduplicating by name+size)
    files.forEach(f => {
      const exists = _selectedFiles.some(sf => sf.name === f.name && sf.size === f.size && sf.lastModified === f.lastModified);
      if (!exists) _selectedFiles.push(f);
    });

    syncInputFiles();
    updateImagesPreview();
  });

  // When user uses the file picker, merge new selections
  input.addEventListener('change', (e) => {
    const picked = Array.from(input.files || []);
    // Replace _selectedFiles with picked (user intent) but keep uniqueness
    _selectedFiles = [];
    picked.forEach(f => _selectedFiles.push(f));
    syncInputFiles();
    updateImagesPreview();
  });

  // Ensure preview reflects any preloaded files
  if (input.files && input.files.length) {
    _selectedFiles = Array.from(input.files);
    updateImagesPreview();
  }

  // Ensure the form includes files before submit (redundant but defensive)
  if (elements.issueForm) {
    elements.issueForm.addEventListener('submit', () => {
      syncInputFiles();
    });
  }
}

// Initialize drag & drop wiring after module load
enableImageDragDrop();
// Initialize drag & drop wiring after module load
enableImageDragDrop();

// Wire issues filter select (All / Mine / Theirs)
(() => {
  const select = elements.issuesFilter || document.getElementById('issuesFilter');
  if (!select) return;

  const LS_KEY = 'tft:issuesFilter';
  // Initialize from localStorage (if available), otherwise fall back to store
  let initial = 'all';
  try {
    const saved = localStorage.getItem(LS_KEY);
    initial = saved || store.state.issuesFilter || 'all';
  } catch (e) {
    initial = store.state.issuesFilter || 'all';
  }

  try {
    select.value = initial;
    store.setState({ issuesFilter: initial });
  } catch (e) { /* ignore */ }

  select.addEventListener('change', (e) => {
    const val = e.target.value || 'all';
    try {
      store.setState({ issuesFilter: val });
      try { localStorage.setItem(LS_KEY, val); } catch (err) { /* ignore storage errors */ }
    } catch (err) {
      console.error('Failed to set issuesFilter:', err);
    }
    try {
      renderIssues(_lastRenderedIssues || []);
    } catch (err) {
      console.error('Failed to re-render issues after changing filter:', err);
    }
  });
})();

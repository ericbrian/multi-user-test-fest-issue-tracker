
/**
 * Toast Notification System
 * Handles displaying non-blocking notifications
 */

let container = null;

function ensureContainer() {
  if (container) return;

  // Reuse the shared container used by real-time notifications so we don't
  // end up with two fixed-position stacks overlapping each other.
  const existing = document.getElementById('toastContainer');
  if (existing) {
    container = existing;
    return;
  }

  container = document.createElement('div');
  container.id = 'toastContainer';
  container.className = 'toast-container';
  document.body.appendChild(container);
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - 'info', 'success', 'warn', or 'error'
 * @param {string} title - Optional title
 * @param {number} duration - Duration in ms (default 3000)
 */
export function showToast(message, type = 'info', title = '', duration = 3000) {
  ensureContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type === 'error' ? 'warn' : type}`;
  
  // Auto-determine title if not provided
  if (!title) {
    if (type === 'error') title = 'Error';
    else if (type === 'success') title = 'Success';
    else if (type === 'warn') title = 'Warning';
    else title = 'Info';
  }

  // Build DOM safely (avoid innerHTML so user-provided/server-provided strings
  // can't inject markup).
  const titleEl = document.createElement('div');
  titleEl.className = 'toast-title';
  titleEl.textContent = title;

  const msgEl = document.createElement('div');
  msgEl.className = 'toast-msg';
  msgEl.textContent = message;

  toast.appendChild(titleEl);
  toast.appendChild(msgEl);

  // Click to dismiss
  toast.addEventListener('click', () => {
    removeToast(toast);
  });

  container.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-enter');
  });

  // Auto dismiss
  if (duration > 0) {
    setTimeout(() => {
      removeToast(toast);
    }, duration);
  }
}

function removeToast(toast) {
  toast.classList.remove('toast-enter');
  toast.classList.add('toast-leave');
  
  toast.addEventListener('transitionend', () => {
    if (toast.parentElement) {
      toast.parentElement.removeChild(toast);
    }
  });
}

export const toast = {
  info: (msg, title) => showToast(msg, 'info', title),
  success: (msg, title) => showToast(msg, 'success', title),
  warn: (msg, title) => showToast(msg, 'warn', title),
  error: (msg, title) => showToast(msg, 'error', title)
};

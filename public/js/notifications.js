export function initNotificationContainer() {
  if (document.getElementById('toastContainer')) return;
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.className = 'toast-container';
  document.body.appendChild(container);
}

export function showNotification(type = 'info', title = '', message = '', timeout = 5000) {
  try {
    initNotificationContainer();
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const html = `
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-msg">${escapeHtml(message)}</div>
    `;
    toast.innerHTML = html;

    container.appendChild(toast);

    // Entrance animation
    requestAnimationFrame(() => {
      toast.classList.add('toast-enter');
    });

    const remove = () => {
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-leave');
      setTimeout(() => {
        if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };

    if (timeout > 0) {
      setTimeout(remove, timeout);
    }

    toast.addEventListener('click', remove);
  } catch (e) {
    // Non-fatal: don't block app if notifications fail
    console.error('Notification error:', e);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

import { showToast } from './toast.js';

// Backwards-compatible wrapper used by socket-driven notifications.
// Keep this module so callers can continue importing `showNotification`,
// but route everything through the single toast implementation.
export function initNotificationContainer() {
  // no-op: `toast.js` owns the shared toast container
}

export function showNotification(type = 'info', title = '', message = '', timeout = 5000) {
  try {
    showToast(message, type, title, timeout);
  } catch (e) {
    // Non-fatal: don't block app if notifications fail
    console.error('Notification error:', e);
  }
}

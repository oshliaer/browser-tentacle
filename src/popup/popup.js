/**
 * Browser Tentacle – Popup Script
 *
 * Handles the configuration UI:
 *   - Loading/saving settings via chrome.storage.sync.
 *   - Toggling between Mode A (webhook) and Mode B (WebSocket) panels.
 *   - Showing live WebSocket connection status.
 *   - Triggering webhook dispatch or WS reconnect via the background service worker.
 */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const modeSelect       = /** @type {HTMLSelectElement} */ (document.getElementById('mode-select'));
const panelA           = /** @type {HTMLElement} */ (document.getElementById('panel-a'));
const panelB           = /** @type {HTMLElement} */ (document.getElementById('panel-b'));
const statusBadge      = /** @type {HTMLElement} */ (document.getElementById('status-badge'));
const feedbackEl       = /** @type {HTMLElement} */ (document.getElementById('feedback'));

// Mode A
const webhookUrlInput  = /** @type {HTMLInputElement} */ (document.getElementById('webhook-url'));
const btnSendWebhook   = /** @type {HTMLButtonElement} */ (document.getElementById('btn-send-webhook'));

// Mode B
const wsUrlInput       = /** @type {HTMLInputElement} */ (document.getElementById('ws-url'));
const apiKeyInput      = /** @type {HTMLInputElement} */ (document.getElementById('api-key'));
const clientIdInput    = /** @type {HTMLInputElement} */ (document.getElementById('client-id'));
const btnSave          = /** @type {HTMLButtonElement} */ (document.getElementById('btn-save'));
const btnDisconnect    = /** @type {HTMLButtonElement} */ (document.getElementById('btn-disconnect'));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Updates the status badge in the header.
 * @param {'connected'|'connecting'|'disconnected'} status
 */
function setStatusBadge(status) {
  statusBadge.textContent =
    status === 'connected'   ? 'Connected'   :
    status === 'connecting'  ? 'Connecting…' : 'Disconnected';

  statusBadge.className = `badge badge--${status}`;
}

/**
 * Shows a feedback message.
 * @param {string}                        message
 * @param {'success'|'error'|'info'}      type
 */
function showFeedback(message, type = 'info') {
  feedbackEl.textContent = message;
  feedbackEl.className = `feedback feedback--${type}`;
  feedbackEl.hidden = false;
  // Auto-hide after 4 s
  setTimeout(() => { feedbackEl.hidden = true; }, 4000);
}

/** Toggles the visible panel based on the selected mode. */
function applyMode(mode) {
  panelA.hidden = mode !== 'A';
  panelB.hidden = mode !== 'B';
  statusBadge.hidden = mode !== 'B';
}

// ── Load saved config ─────────────────────────────────────────────────────────

async function loadConfig() {
  const config = await chrome.storage.sync.get({
    mode: 'A',
    webhookUrl: '',
    wsUrl: '',
    apiKey: '',
    clientId: '',
  });

  modeSelect.value        = config.mode;
  webhookUrlInput.value   = config.webhookUrl;
  wsUrlInput.value        = config.wsUrl;
  apiKeyInput.value       = config.apiKey;
  clientIdInput.value     = config.clientId;

  applyMode(config.mode);

  // Fetch live WS status from background
  if (config.mode === 'B') {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'get_ws_status' });
      setStatusBadge(res?.status ?? 'disconnected');
    } catch {
      setStatusBadge('disconnected');
    }
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

modeSelect.addEventListener('change', async () => {
  const mode = modeSelect.value;
  applyMode(mode);
  await chrome.storage.sync.set({ mode });
});

// Mode A – send webhook
btnSendWebhook.addEventListener('click', async () => {
  const url = webhookUrlInput.value.trim();
  if (!url) {
    showFeedback('Please enter a Webhook URL.', 'error');
    return;
  }
  await chrome.storage.sync.set({ webhookUrl: url });

  btnSendWebhook.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'send_webhook' });
    if (res?.ok) {
      showFeedback('Context sent successfully!', 'success');
    } else {
      showFeedback(`Error: ${res?.error ?? 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showFeedback(`Error: ${err.message}`, 'error');
  } finally {
    btnSendWebhook.disabled = false;
  }
});

// Mode B – save & connect
btnSave.addEventListener('click', async () => {
  const wsUrl  = wsUrlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();

  if (!wsUrl) {
    showFeedback('Please enter a WebSocket URL.', 'error');
    return;
  }

  await chrome.storage.sync.set({ wsUrl, apiKey, mode: 'B' });
  setStatusBadge('connecting');

  btnSave.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'reconnect_ws' });
    if (res?.ok) {
      showFeedback('Connecting…', 'info');
    } else {
      showFeedback(`Error: ${res?.error ?? 'Unknown error'}`, 'error');
      setStatusBadge('disconnected');
    }
  } catch (err) {
    showFeedback(`Error: ${err.message}`, 'error');
    setStatusBadge('disconnected');
  } finally {
    btnSave.disabled = false;
  }
});

// Mode B – disconnect
btnDisconnect.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'disconnect_ws' });
  await chrome.storage.sync.set({ wsUrl: '', apiKey: '' });
  wsUrlInput.value = '';
  apiKeyInput.value = '';
  setStatusBadge('disconnected');
  showFeedback('Disconnected.', 'info');
});

// Mode B webhook URL save on blur
webhookUrlInput.addEventListener('blur', async () => {
  const url = webhookUrlInput.value.trim();
  if (url) await chrome.storage.sync.set({ webhookUrl: url });
});

// Listen for status updates pushed by the background service worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'ws_status') {
    setStatusBadge(msg.status);
  }
});

// ── Initialise ────────────────────────────────────────────────────────────────

loadConfig().catch(console.error);

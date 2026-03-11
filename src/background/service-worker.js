/**
 * Browser Tentacle – Service Worker (Background)
 *
 * Orchestrates:
 *   1. Loading / persisting configuration from chrome.storage.sync.
 *   2. Managing the WebSocket connection (Mode B) or webhook dispatch (Mode A).
 *   3. Pushing browser context updates to the server.
 *   4. Routing inbound commands through SecurityMiddleware → CommandExecutor.
 *   5. Returning results / errors back to the server.
 */

'use strict';

import { WebSocketManager } from './websocket-manager.js';
import { CommandExecutor } from './command-executor.js';
import { SecurityMiddleware } from './security-middleware.js';
import {
  MessageType,
  createContextMessage,
  createResultMessage,
  createErrorMessage,
} from '../shared/protocol.js';

// ── Singleton instances ───────────────────────────────────────────────────────

let wsManager = null;
const executor = new CommandExecutor();
const security = new SecurityMiddleware();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Loads configuration from chrome.storage.sync.
 * @returns {Promise<Object>}
 */
async function loadConfig() {
  return chrome.storage.sync.get({
    mode: 'A',           // 'A' = Webhook, 'B' = WebSocket
    webhookUrl: '',
    wsUrl: '',
    apiKey: '',
    clientId: '',
  });
}

/**
 * Ensures the config contains a clientId; generates one if absent.
 * @returns {Promise<string>}
 */
async function ensureClientId() {
  const { clientId } = await chrome.storage.sync.get({ clientId: '' });
  if (clientId) return clientId;
  const id = crypto.randomUUID();
  await chrome.storage.sync.set({ clientId: id });
  return id;
}

/**
 * Collects the current browser context from the active tab.
 * @returns {Promise<Object|null>}
 */
async function collectContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return null;

    // Try to get selected text from the content script
    let selection = '';
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() ?? '',
      });
      selection = results?.[0]?.result ?? '';
    } catch {
      // Content scripts may not be injectable on restricted pages
    }

    return {
      tabId: tab.id,
      url: tab.url ?? '',
      title: tab.title ?? '',
      selection,
      active: tab.active ?? true,
    };
  } catch {
    return null;
  }
}

/**
 * Sends a one-shot HTTP POST to the configured webhook URL.
 * @param {string} url
 * @param {Object} payload
 */
async function sendWebhook(url, payload) {
  if (!url) throw new Error('Webhook URL is not configured');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Webhook returned HTTP ${response.status}`);
  }
}

// ── WebSocket command handler ─────────────────────────────────────────────────

/**
 * Handles an inbound server message on the WebSocket.
 * @param {Object} msg
 */
async function handleServerMessage(msg) {
  if (msg.type !== MessageType.COMMAND) return;

  const command = msg;
  const { commandId } = command;

  const validation = await security.validateCommand(command);
  if (!validation.allowed) {
    const errorMsg = createErrorMessage(commandId, validation.reason ?? 'Blocked by security policy');
    wsManager.send(errorMsg);
    return;
  }

  let result;
  try {
    result = await executor.execute(command);
    const resultMsg = createResultMessage(commandId, result);
    wsManager.send(resultMsg);
    security.logCommand(command, result);
  } catch (err) {
    const errorMsg = createErrorMessage(commandId, err.message);
    wsManager.send(errorMsg);
    security.logCommand(command, { error: err.message });
  }
}

// ── Initialisation ────────────────────────────────────────────────────────────

async function initialise() {
  const clientId = await ensureClientId();
  const config = await loadConfig();

  if (config.mode === 'B' && config.wsUrl) {
    wsManager = new WebSocketManager(clientId);
    wsManager.onMessage(handleServerMessage);

    wsManager.onStatusChange(async (status) => {
      console.info('[ServiceWorker] WS status:', status);
      // Broadcast status to popup if open
      try {
        await chrome.runtime.sendMessage({ type: 'ws_status', status });
      } catch {
        // Popup not open; ignore
      }
      // Push context when connected
      if (status === 'connected') {
        const ctx = await collectContext();
        if (ctx) wsManager.send(createContextMessage(ctx));
      }
    });

    wsManager.connect(config.wsUrl, config.apiKey);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

// Run on service worker startup
initialise().catch(console.error);

// Re-initialise when config changes
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;
  const relevantKeys = ['mode', 'wsUrl', 'apiKey', 'webhookUrl'];
  if (!relevantKeys.some((k) => k in changes)) return;

  if (wsManager) {
    wsManager.disconnect();
    wsManager = null;
  }
  initialise().catch(console.error);
});

// Push context updates when the active tab changes
chrome.tabs.onActivated.addListener(async () => {
  if (!wsManager || wsManager.status !== 'connected') return;
  const ctx = await collectContext();
  if (ctx) wsManager.send(createContextMessage(ctx));
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  if (!wsManager || wsManager.status !== 'connected') return;
  const ctx = await collectContext();
  if (ctx && ctx.tabId === tabId) wsManager.send(createContextMessage(ctx));
});

// Handle messages from the popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'get_ws_status') {
    sendResponse({ status: wsManager ? wsManager.status : 'disconnected' });
    return true;
  }

  if (msg.type === 'disconnect_ws') {
    if (wsManager) {
      wsManager.disconnect();
      wsManager = null;
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'send_webhook') {
    loadConfig()
      .then(({ webhookUrl }) => collectContext().then((ctx) => sendWebhook(webhookUrl, ctx)))
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }

  if (msg.type === 'reconnect_ws') {
    if (wsManager) wsManager.disconnect();
    wsManager = null;
    initialise()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

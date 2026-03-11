/**
 * Browser Tentacle – WebSocket Manager
 *
 * Manages the persistent WebSocket connection between the extension and
 * the configured server.  Provides:
 *   - Automatic reconnect with exponential back-off.
 *   - Incoming message routing via registered handlers.
 *   - A send queue that flushes once the socket is open.
 */

'use strict';

import { createHandshake, parseServerMessage } from '../shared/protocol.js';

/** Minimum delay (ms) before a reconnect attempt. */
const RECONNECT_DELAY_MIN = 1000;
/** Maximum delay (ms) between reconnect attempts. */
const RECONNECT_DELAY_MAX = 30_000;
/** Multiplier applied to the delay after each failed attempt. */
const RECONNECT_BACKOFF_FACTOR = 2;

/**
 * @typedef {(message: Object) => void} MessageHandler
 */

class WebSocketManager {
  /**
   * @param {string}  clientId - UUID identifying this extension client.
   */
  constructor(clientId) {
    this._clientId = clientId;

    /** @type {WebSocket|null} */
    this._ws = null;

    /** Whether the socket is being closed intentionally (skip reconnect). */
    this._intentionallyClosed = false;

    /** Current reconnect delay in ms. */
    this._reconnectDelay = RECONNECT_DELAY_MIN;

    /** @type {number|null} Timer handle for the pending reconnect. */
    this._reconnectTimer = null;

    /** Messages buffered while the socket is not yet open. */
    this._sendQueue = [];

    /** Registered message handlers (called for every inbound server message). */
    this._messageHandlers = new Set();

    /** Optional callback invoked with connection state changes. */
    this._onStatusChange = null;
  }

  /**
   * Registers a callback that receives every parsed server message.
   * @param {MessageHandler} handler
   */
  onMessage(handler) {
    this._messageHandlers.add(handler);
  }

  /**
   * Registers a callback for connection status changes.
   * @param {(status: 'connecting'|'connected'|'disconnected') => void} cb
   */
  onStatusChange(cb) {
    this._onStatusChange = cb;
  }

  /**
   * Opens a WebSocket connection to `url`.
   * If a connection already exists it is closed first.
   *
   * @param {string} url    - WebSocket server URL (ws:// or wss://).
   * @param {string} apiKey - Optional API key sent as a query parameter.
   */
  connect(url, apiKey = '') {
    this._closeExisting();
    this._intentionallyClosed = false;

    const fullUrl = apiKey ? `${url}?apiKey=${encodeURIComponent(apiKey)}` : url;
    this._openSocket(fullUrl);
  }

  /** Permanently stops the manager and closes the socket. */
  disconnect() {
    this._intentionallyClosed = true;
    this._cancelReconnect();
    this._closeExisting();
    this._notify('disconnected');
  }

  /**
   * Sends a JSON-serialisable object.
   * If the socket is not yet open the message is queued.
   *
   * @param {Object} message
   */
  send(message) {
    const serialised = JSON.stringify(message);
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(serialised);
    } else {
      this._sendQueue.push(serialised);
    }
  }

  /** @returns {'connecting'|'connected'|'disconnected'} */
  get status() {
    if (!this._ws) return 'disconnected';
    switch (this._ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN:       return 'connected';
      default:                   return 'disconnected';
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  _openSocket(url) {
    this._notify('connecting');
    try {
      this._ws = new WebSocket(url);
    } catch (err) {
      console.warn('[WebSocketManager] Failed to construct WebSocket:', err);
      this._scheduleReconnect(url);
      return;
    }

    this._ws.addEventListener('open', () => {
      this._reconnectDelay = RECONNECT_DELAY_MIN;
      this._notify('connected');
      // Send handshake first
      this._ws.send(JSON.stringify(createHandshake(this._clientId)));
      // Flush queued messages
      while (this._sendQueue.length > 0) {
        this._ws.send(this._sendQueue.shift());
      }
    });

    this._ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = parseServerMessage(event.data);
      } catch (err) {
        console.warn('[WebSocketManager] Unparseable message:', err);
        return;
      }
      for (const handler of this._messageHandlers) {
        try {
          handler(msg);
        } catch (handlerErr) {
          console.error('[WebSocketManager] Handler error:', handlerErr);
        }
      }
    });

    this._ws.addEventListener('close', (event) => {
      console.info(`[WebSocketManager] Connection closed (code=${event.code}).`);
      this._notify('disconnected');
      if (!this._intentionallyClosed) {
        this._scheduleReconnect(url);
      }
    });

    this._ws.addEventListener('error', (event) => {
      console.warn('[WebSocketManager] WebSocket error:', event);
      // The 'close' event will follow; reconnect handled there.
    });
  }

  _closeExisting() {
    if (this._ws) {
      this._intentionallyClosed = true;
      this._ws.close();
      this._ws = null;
    }
  }

  _scheduleReconnect(url) {
    this._cancelReconnect();
    console.info(`[WebSocketManager] Reconnecting in ${this._reconnectDelay}ms…`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._reconnectDelay = Math.min(
        this._reconnectDelay * RECONNECT_BACKOFF_FACTOR,
        RECONNECT_DELAY_MAX,
      );
      this._openSocket(url);
    }, this._reconnectDelay);
  }

  _cancelReconnect() {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _notify(status) {
    if (typeof this._onStatusChange === 'function') {
      try {
        this._onStatusChange(status);
      } catch {}
    }
  }
}

export { WebSocketManager };

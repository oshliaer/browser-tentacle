/**
 * Browser Tentacle – Shared Protocol Definitions (v0.1)
 *
 * Defines all message types and factory functions used for communication
 * between the extension (client) and the remote server.
 */

'use strict';

/** Protocol version string sent in every handshake. */
const PROTOCOL_VERSION = '0.1';

/** Capabilities advertised by this client during handshake. */
const CLIENT_CAPABILITIES = ['dom_read', 'dom_write', 'navigation', 'notifications'];

/**
 * Supported message types.
 * @enum {string}
 */
const MessageType = {
  /** Client → Server: initial connection announcement. */
  HANDSHAKE: 'handshake',
  /** Client → Server: current browser context snapshot. */
  CONTEXT: 'context',
  /** Server → Client: an action the extension should perform. */
  COMMAND: 'command',
  /** Client → Server: outcome of a previously received command. */
  RESULT: 'result',
  /** Client → Server: an error that occurred while processing a command. */
  ERROR: 'error',
};

/**
 * Supported command action identifiers (Server → Client).
 * @enum {string}
 */
const CommandAction = {
  // Navigation
  NAVIGATE: 'navigate',
  RELOAD: 'reload',

  // DOM actions
  CLICK: 'click',
  FILL_FORM: 'fill_form',
  SCROLL: 'scroll',

  // Data retrieval
  GET_ELEMENT_TEXT: 'get_element_text',
  GET_PAGE_HTML: 'get_page_html',
  GET_COOKIES: 'get_cookies',
  GET_SELECTION: 'get_selection',

  // User notification
  NOTIFY: 'notify',
};

/**
 * Creates a handshake message payload.
 *
 * @param {string} clientId - Unique identifier for this client (UUID).
 * @returns {{ type: string, clientId: string, protocolVersion: string, capabilities: string[] }}
 */
function createHandshake(clientId) {
  return {
    type: MessageType.HANDSHAKE,
    clientId,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: [...CLIENT_CAPABILITIES],
  };
}

/**
 * Creates a context update message payload.
 *
 * @param {{ tabId: number, url: string, title: string, selection: string, active: boolean }} ctx
 * @returns {{ type: string, tabId: number, url: string, title: string, selection: string, active: boolean }}
 */
function createContextMessage(ctx) {
  return {
    type: MessageType.CONTEXT,
    tabId: ctx.tabId,
    url: ctx.url,
    title: ctx.title ?? '',
    selection: ctx.selection ?? '',
    active: ctx.active ?? false,
  };
}

/**
 * Creates a success result message payload.
 *
 * @param {string} commandId - The ID of the command being responded to.
 * @param {unknown} data - The result data.
 * @returns {{ type: string, commandId: string, status: 'success', data: unknown }}
 */
function createResultMessage(commandId, data) {
  return {
    type: MessageType.RESULT,
    commandId,
    status: 'success',
    data,
  };
}

/**
 * Creates an error result message payload.
 *
 * @param {string} commandId - The ID of the command being responded to.
 * @param {string} message - Human-readable error description.
 * @returns {{ type: string, commandId: string, status: 'error', error: string }}
 */
function createErrorMessage(commandId, message) {
  return {
    type: MessageType.ERROR,
    commandId,
    status: 'error',
    error: message,
  };
}

/**
 * Parses and validates an inbound JSON string from the server.
 * Throws if the payload is not valid JSON or lacks a `type` field.
 *
 * @param {string} raw - Raw JSON string received over the transport.
 * @returns {{ type: string, [key: string]: unknown }}
 */
function parseServerMessage(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON received: ${raw}`);
  }
  if (!parsed || typeof parsed.type !== 'string') {
    throw new Error('Server message missing required "type" field');
  }
  return parsed;
}

// Export for ES module consumers (service-worker, tests)
export {
  PROTOCOL_VERSION,
  CLIENT_CAPABILITIES,
  MessageType,
  CommandAction,
  createHandshake,
  createContextMessage,
  createResultMessage,
  createErrorMessage,
  parseServerMessage,
};

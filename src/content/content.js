/**
 * Browser Tentacle – Content Script
 *
 * Runs in every page context.  Primarily used as a relay for DOM queries and
 * actions that the background service worker delegates via chrome.scripting.
 * (The actual DOM manipulation functions are injected directly by
 * CommandExecutor._contentDispatch; this script handles any page-level setup
 * and long-lived message listeners if needed in future versions.)
 */

'use strict';

// Listen for messages from the background service worker (future use).
// In v0.1 all DOM actions are dispatched via chrome.scripting.executeScript,
// so this listener is a no-op stub that can be extended.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ping') {
    sendResponse({ type: 'pong', url: window.location.href });
    return true;
  }
});

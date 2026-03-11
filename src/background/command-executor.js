/**
 * Browser Tentacle – Command Executor
 *
 * Receives a parsed command object from the server and dispatches it to the
 * appropriate Chrome API or content-script handler.  Returns a Promise that
 * resolves with the result data or rejects with an Error.
 */

'use strict';

import { CommandAction } from '../shared/protocol.js';

/**
 * @typedef {Object} Command
 * @property {string}  commandId
 * @property {string}  action
 * @property {Object}  [params]
 * @property {number}  [timeout]
 */

class CommandExecutor {
  /**
   * Executes a command.
   *
   * @param {Command} command
   * @returns {Promise<unknown>} Resolves with the action result.
   */
  async execute(command) {
    const { action, params = {} } = command;

    switch (action) {
      case CommandAction.NAVIGATE:
        return this._navigate(params);

      case CommandAction.RELOAD:
        return this._reload(params);

      case CommandAction.CLICK:
        return this._domAction('click', params);

      case CommandAction.FILL_FORM:
        return this._domAction('fill_form', params);

      case CommandAction.SCROLL:
        return this._domAction('scroll', params);

      case CommandAction.GET_ELEMENT_TEXT:
        return this._domAction('get_element_text', params);

      case CommandAction.GET_PAGE_HTML:
        return this._domAction('get_page_html', params);

      case CommandAction.GET_COOKIES:
        return this._getCookies(params);

      case CommandAction.GET_SELECTION:
        return this._domAction('get_selection', params);

      case CommandAction.NOTIFY:
        return this._notify(params);

      default:
        throw new Error(`Unknown command action: "${action}"`);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Navigates the specified (or active) tab to a URL.
   * @param {{ url: string, tabId?: number }} params
   */
  async _navigate({ url, tabId } = {}) {
    if (!url) throw new Error('"url" param is required for navigate');
    const tab = await this._resolveTab(tabId);
    await chrome.tabs.update(tab.id, { url });
    return { navigated: true, tabId: tab.id, url };
  }

  /**
   * Reloads the specified (or active) tab.
   * @param {{ tabId?: number, bypassCache?: boolean }} params
   */
  async _reload({ tabId, bypassCache = false } = {}) {
    const tab = await this._resolveTab(tabId);
    await chrome.tabs.reload(tab.id, { bypassCache });
    return { reloaded: true, tabId: tab.id };
  }

  /**
   * Delegates a DOM-level action to the content script via chrome.scripting.
   * @param {string}  action
   * @param {Object}  params
   */
  async _domAction(action, params) {
    const tabId = params.tabId ?? (await this._getActiveTabId());
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: _contentDispatch,
      args: [action, params],
    });
    if (!results || results.length === 0) {
      throw new Error('executeScript returned no results');
    }
    const { result, error } = results[0].result ?? {};
    if (error) throw new Error(error);
    return result;
  }

  /**
   * Retrieves cookies for a given URL.
   * @param {{ url?: string }} params
   */
  async _getCookies({ url } = {}) {
    if (!url) {
      const tab = await this._resolveTab();
      url = tab.url;
    }
    const cookies = await chrome.cookies.getAll({ url });
    return { cookies };
  }

  /**
   * Shows a browser notification.
   * @param {{ title?: string, message: string, iconUrl?: string }} params
   */
  async _notify({ title = 'Browser Tentacle', message, iconUrl = '' } = {}) {
    if (!message) throw new Error('"message" param is required for notify');
    await chrome.notifications.create('', {
      type: 'basic',
      iconUrl: iconUrl || chrome.runtime.getURL('icons/icon48.png'),
      title,
      message,
    });
    return { notified: true };
  }

  /** Returns the active tab in the current window. */
  async _getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');
    return tab;
  }

  /** Returns the active tab ID. */
  async _getActiveTabId() {
    return (await this._getActiveTab()).id;
  }

  /** Resolves a tab by ID or falls back to the active tab. */
  async _resolveTab(tabId) {
    if (tabId != null) return chrome.tabs.get(tabId);
    return this._getActiveTab();
  }
}

// ── Content-script dispatch function ─────────────────────────────────────────
// This function is serialised and injected into the target tab via
// chrome.scripting.executeScript – it must be self-contained (no closures over
// module-level variables).

/* eslint-disable no-undef */
/**
 * Dispatched into the target tab page context to perform DOM actions.
 * Must be a plain function (not an arrow function) so it is injectable.
 *
 * @param {string} action
 * @param {Object} params
 * @returns {{ result: unknown, error: string|null }}
 */
function _contentDispatch(action, params) {
  try {
    switch (action) {
      case 'click': {
        const el = document.querySelector(params.selector);
        if (!el) return { error: `Element not found: ${params.selector}` };
        el.click();
        return { result: { clicked: true, selector: params.selector } };
      }

      case 'fill_form': {
        const el = document.querySelector(params.selector);
        if (!el) return { error: `Element not found: ${params.selector}` };
        el.focus();
        el.value = params.value ?? '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { result: { filled: true, selector: params.selector } };
      }

      case 'scroll': {
        const target = params.selector
          ? document.querySelector(params.selector)
          : window;
        if (params.selector && !target) {
          return { error: `Element not found: ${params.selector}` };
        }
        const scrollOptions = {
          top: params.top ?? 0,
          left: params.left ?? 0,
          behavior: params.behavior ?? 'smooth',
        };
        if (target === window) {
          window.scrollBy(scrollOptions);
        } else {
          target.scrollBy(scrollOptions);
        }
        return { result: { scrolled: true } };
      }

      case 'get_element_text': {
        const el = document.querySelector(params.selector);
        if (!el) return { error: `Element not found: ${params.selector}` };
        return { result: { text: el.innerText ?? el.textContent ?? '' } };
      }

      case 'get_page_html': {
        const selector = params.selector;
        if (selector) {
          const el = document.querySelector(selector);
          if (!el) return { error: `Element not found: ${selector}` };
          return { result: { html: el.outerHTML } };
        }
        return { result: { html: document.documentElement.outerHTML } };
      }

      case 'get_selection': {
        const selection = window.getSelection()?.toString() ?? '';
        return { result: { selection } };
      }

      default:
        return { error: `Unknown DOM action: ${action}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}
/* eslint-enable no-undef */

export { CommandExecutor, _contentDispatch };

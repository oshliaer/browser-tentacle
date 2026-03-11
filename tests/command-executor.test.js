/**
 * Tests for src/background/command-executor.js
 *
 * The CommandExecutor calls Chrome extension APIs (chrome.tabs, chrome.scripting,
 * chrome.cookies, chrome.notifications).  We provide lightweight mocks for all
 * of them via globalThis.chrome before each test.
 */

import { jest } from '@jest/globals';
import { CommandExecutor, _contentDispatch } from '../src/background/command-executor.js';

// ── Chrome API mock helpers ────────────────────────────────────────────────────

function makeChromeMock({ tab = { id: 10, url: 'https://example.com', active: true }, scriptResult = null } = {}) {
  return {
    runtime: {
      getURL: jest.fn((path) => `chrome-extension://fake-id/${path}`),
    },
    tabs: {
      query: jest.fn().mockResolvedValue([tab]),
      update: jest.fn().mockResolvedValue(tab),
      reload: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(tab),
    },
    scripting: {
      executeScript: jest.fn().mockResolvedValue([{ result: scriptResult ?? { result: null, error: null } }]),
    },
    cookies: {
      getAll: jest.fn().mockResolvedValue([{ name: 'session', value: 'abc' }]),
    },
    notifications: {
      create: jest.fn().mockResolvedValue('notif-id'),
    },
  };
}

// ── CommandExecutor – navigation actions ──────────────────────────────────────

describe('CommandExecutor – navigate', () => {
  let executor;
  let chromeMock;

  beforeEach(() => {
    chromeMock = makeChromeMock();
    globalThis.chrome = chromeMock;
    executor = new CommandExecutor();
  });

  test('calls chrome.tabs.update with the given URL', async () => {
    const result = await executor.execute({ commandId: 'c1', action: 'navigate', params: { url: 'https://new.com' } });
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(10, { url: 'https://new.com' });
    expect(result.navigated).toBe(true);
  });

  test('throws if url param is missing', async () => {
    await expect(executor.execute({ commandId: 'c2', action: 'navigate', params: {} }))
      .rejects.toThrow('"url" param is required');
  });

  test('uses tabId param when provided', async () => {
    chromeMock.tabs.get = jest.fn().mockResolvedValue({ id: 99, url: 'https://old.com', active: false });
    await executor.execute({ commandId: 'c3', action: 'navigate', params: { url: 'https://new.com', tabId: 99 } });
    expect(chromeMock.tabs.get).toHaveBeenCalledWith(99);
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(99, { url: 'https://new.com' });
  });
});

describe('CommandExecutor – reload', () => {
  let executor;
  let chromeMock;

  beforeEach(() => {
    chromeMock = makeChromeMock();
    globalThis.chrome = chromeMock;
    executor = new CommandExecutor();
  });

  test('calls chrome.tabs.reload on active tab', async () => {
    const result = await executor.execute({ commandId: 'r1', action: 'reload', params: {} });
    expect(chromeMock.tabs.reload).toHaveBeenCalledWith(10, { bypassCache: false });
    expect(result.reloaded).toBe(true);
  });

  test('supports bypassCache param', async () => {
    await executor.execute({ commandId: 'r2', action: 'reload', params: { bypassCache: true } });
    expect(chromeMock.tabs.reload).toHaveBeenCalledWith(10, { bypassCache: true });
  });
});

// ── CommandExecutor – DOM actions ─────────────────────────────────────────────

describe('CommandExecutor – DOM actions (via scripting.executeScript)', () => {
  let executor;
  let chromeMock;

  beforeEach(() => {
    chromeMock = makeChromeMock({ scriptResult: { result: { text: '$99.00' }, error: null } });
    globalThis.chrome = chromeMock;
    executor = new CommandExecutor();
  });

  test('get_element_text forwards to content script and returns result', async () => {
    const result = await executor.execute({
      commandId: 'd1',
      action: 'get_element_text',
      params: { selector: '.price' },
    });
    expect(chromeMock.scripting.executeScript).toHaveBeenCalled();
    expect(result).toEqual({ text: '$99.00' });
  });

  test('throws when content script returns an error', async () => {
    chromeMock.scripting.executeScript.mockResolvedValue([{ result: { error: 'Element not found: .missing' } }]);
    await expect(executor.execute({
      commandId: 'd2',
      action: 'click',
      params: { selector: '.missing' },
    })).rejects.toThrow('Element not found: .missing');
  });

  test('throws when executeScript returns empty results', async () => {
    chromeMock.scripting.executeScript.mockResolvedValue([]);
    await expect(executor.execute({
      commandId: 'd3',
      action: 'get_page_html',
      params: {},
    })).rejects.toThrow('executeScript returned no results');
  });
});

// ── CommandExecutor – getCookies ──────────────────────────────────────────────

describe('CommandExecutor – get_cookies', () => {
  let executor;
  let chromeMock;

  beforeEach(() => {
    chromeMock = makeChromeMock();
    globalThis.chrome = chromeMock;
    executor = new CommandExecutor();
  });

  test('calls chrome.cookies.getAll with provided URL', async () => {
    const result = await executor.execute({
      commandId: 'ck1',
      action: 'get_cookies',
      params: { url: 'https://example.com' },
    });
    expect(chromeMock.cookies.getAll).toHaveBeenCalledWith({ url: 'https://example.com' });
    expect(result.cookies).toBeDefined();
    expect(result.cookies[0].name).toBe('session');
  });

  test('falls back to active tab URL when url is not provided', async () => {
    const result = await executor.execute({ commandId: 'ck2', action: 'get_cookies', params: {} });
    expect(chromeMock.cookies.getAll).toHaveBeenCalledWith({ url: 'https://example.com' });
    expect(result.cookies).toBeDefined();
  });
});

// ── CommandExecutor – notify ──────────────────────────────────────────────────

describe('CommandExecutor – notify', () => {
  let executor;
  let chromeMock;

  beforeEach(() => {
    chromeMock = makeChromeMock();
    globalThis.chrome = chromeMock;
    executor = new CommandExecutor();
  });

  test('calls chrome.notifications.create with message', async () => {
    const result = await executor.execute({
      commandId: 'n1',
      action: 'notify',
      params: { message: 'Hello!', title: 'Test' },
    });
    expect(chromeMock.notifications.create).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ message: 'Hello!', title: 'Test' }),
    );
    expect(result.notified).toBe(true);
  });

  test('throws when message is missing', async () => {
    await expect(executor.execute({ commandId: 'n2', action: 'notify', params: {} }))
      .rejects.toThrow('"message" param is required');
  });
});

// ── CommandExecutor – unknown action ─────────────────────────────────────────

describe('CommandExecutor – unknown action', () => {
  test('throws on unknown action', async () => {
    globalThis.chrome = makeChromeMock();
    const executor = new CommandExecutor();
    await expect(executor.execute({ commandId: 'u1', action: 'fly_to_mars', params: {} }))
      .rejects.toThrow('Unknown command action: "fly_to_mars"');
  });
});

// ── _contentDispatch – in-page function ──────────────────────────────────────

describe('_contentDispatch (DOM simulation)', () => {
  // We test _contentDispatch in isolation by setting up a minimal DOM-like
  // environment using jsdom globals (available in jest's node env we mock manually).

  const mockDoc = () => {
    const elements = new Map();

    const makeEl = (text, html) => ({
      innerText: text,
      textContent: text,
      outerHTML: html,
      value: '',
      focus: jest.fn(),
      click: jest.fn(),
      scrollBy: jest.fn(),
      dispatchEvent: jest.fn(),
    });

    elements.set('.price', makeEl('$99.00', '<span class="price">$99.00</span>'));
    elements.set('#name', makeEl('', '<input id="name" />'));

    globalThis.document = {
      querySelector: (sel) => elements.get(sel) ?? null,
      documentElement: { outerHTML: '<html></html>' },
    };
    globalThis.window = {
      getSelection: () => ({ toString: () => 'selected text' }),
      scrollBy: jest.fn(),
      location: { href: 'https://test.com' },
    };
    globalThis.Event = class Event {
      constructor(type, opts) { this.type = type; this.bubbles = opts?.bubbles; }
    };
    return elements;
  };

  test('get_element_text returns text', () => {
    mockDoc();
    const { result } = _contentDispatch('get_element_text', { selector: '.price' });
    expect(result.text).toBe('$99.00');
  });

  test('get_element_text returns error for missing element', () => {
    mockDoc();
    const { error } = _contentDispatch('get_element_text', { selector: '.missing' });
    expect(error).toMatch('Element not found');
  });

  test('get_page_html returns full HTML when no selector', () => {
    mockDoc();
    const { result } = _contentDispatch('get_page_html', {});
    expect(result.html).toBe('<html></html>');
  });

  test('get_page_html with selector returns element outerHTML', () => {
    mockDoc();
    const { result } = _contentDispatch('get_page_html', { selector: '.price' });
    expect(result.html).toContain('price');
  });

  test('click dispatches click on element', () => {
    const els = mockDoc();
    const { result } = _contentDispatch('click', { selector: '.price' });
    expect(els.get('.price').click).toHaveBeenCalled();
    expect(result.clicked).toBe(true);
  });

  test('click returns error for missing element', () => {
    mockDoc();
    const { error } = _contentDispatch('click', { selector: '.no-such' });
    expect(error).toMatch('Element not found');
  });

  test('fill_form sets element value', () => {
    const els = mockDoc();
    const { result } = _contentDispatch('fill_form', { selector: '#name', value: 'Alice' });
    expect(els.get('#name').value).toBe('Alice');
    expect(result.filled).toBe(true);
  });

  test('get_selection returns selected text', () => {
    mockDoc();
    const { result } = _contentDispatch('get_selection', {});
    expect(result.selection).toBe('selected text');
  });

  test('scroll with no selector scrolls window', () => {
    mockDoc();
    const { result } = _contentDispatch('scroll', { top: 100 });
    expect(globalThis.window.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 100 }),
    );
    expect(result.scrolled).toBe(true);
  });

  test('unknown action returns error', () => {
    mockDoc();
    const { error } = _contentDispatch('unknown_action', {});
    expect(error).toMatch('Unknown DOM action');
  });
});

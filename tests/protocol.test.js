/**
 * Tests for src/shared/protocol.js
 */

import {
  PROTOCOL_VERSION,
  CLIENT_CAPABILITIES,
  MessageType,
  CommandAction,
  createHandshake,
  createContextMessage,
  createResultMessage,
  createErrorMessage,
  parseServerMessage,
} from '../src/shared/protocol.js';

describe('protocol constants', () => {
  test('PROTOCOL_VERSION is a non-empty string', () => {
    expect(typeof PROTOCOL_VERSION).toBe('string');
    expect(PROTOCOL_VERSION.length).toBeGreaterThan(0);
  });

  test('CLIENT_CAPABILITIES is a non-empty array of strings', () => {
    expect(Array.isArray(CLIENT_CAPABILITIES)).toBe(true);
    expect(CLIENT_CAPABILITIES.length).toBeGreaterThan(0);
    CLIENT_CAPABILITIES.forEach((c) => expect(typeof c).toBe('string'));
  });
});

describe('MessageType enum', () => {
  test('contains expected keys', () => {
    expect(MessageType.HANDSHAKE).toBe('handshake');
    expect(MessageType.CONTEXT).toBe('context');
    expect(MessageType.COMMAND).toBe('command');
    expect(MessageType.RESULT).toBe('result');
    expect(MessageType.ERROR).toBe('error');
  });
});

describe('CommandAction enum', () => {
  test('contains navigation actions', () => {
    expect(CommandAction.NAVIGATE).toBe('navigate');
    expect(CommandAction.RELOAD).toBe('reload');
  });

  test('contains DOM actions', () => {
    expect(CommandAction.CLICK).toBe('click');
    expect(CommandAction.FILL_FORM).toBe('fill_form');
    expect(CommandAction.SCROLL).toBe('scroll');
  });

  test('contains data retrieval actions', () => {
    expect(CommandAction.GET_ELEMENT_TEXT).toBe('get_element_text');
    expect(CommandAction.GET_PAGE_HTML).toBe('get_page_html');
    expect(CommandAction.GET_COOKIES).toBe('get_cookies');
    expect(CommandAction.GET_SELECTION).toBe('get_selection');
  });

  test('contains notification action', () => {
    expect(CommandAction.NOTIFY).toBe('notify');
  });
});

describe('createHandshake()', () => {
  test('returns object with correct type', () => {
    const msg = createHandshake('test-uuid');
    expect(msg.type).toBe(MessageType.HANDSHAKE);
  });

  test('includes clientId', () => {
    const msg = createHandshake('my-client-id');
    expect(msg.clientId).toBe('my-client-id');
  });

  test('includes protocolVersion', () => {
    const msg = createHandshake('x');
    expect(msg.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  test('includes capabilities array', () => {
    const msg = createHandshake('x');
    expect(Array.isArray(msg.capabilities)).toBe(true);
    expect(msg.capabilities).toEqual(CLIENT_CAPABILITIES);
  });

  test('capabilities is a copy (mutation-safe)', () => {
    const msg = createHandshake('x');
    msg.capabilities.push('extra');
    expect(CLIENT_CAPABILITIES).not.toContain('extra');
  });
});

describe('createContextMessage()', () => {
  test('returns object with correct type', () => {
    const msg = createContextMessage({ tabId: 1, url: 'https://a.com', title: 'A', selection: '', active: true });
    expect(msg.type).toBe(MessageType.CONTEXT);
  });

  test('maps all provided fields', () => {
    const msg = createContextMessage({ tabId: 42, url: 'https://b.com', title: 'B', selection: 'hello', active: false });
    expect(msg.tabId).toBe(42);
    expect(msg.url).toBe('https://b.com');
    expect(msg.title).toBe('B');
    expect(msg.selection).toBe('hello');
    expect(msg.active).toBe(false);
  });

  test('defaults title and selection to empty string', () => {
    const msg = createContextMessage({ tabId: 1, url: 'https://c.com' });
    expect(msg.title).toBe('');
    expect(msg.selection).toBe('');
  });

  test('defaults active to false', () => {
    const msg = createContextMessage({ tabId: 1, url: 'https://c.com' });
    expect(msg.active).toBe(false);
  });
});

describe('createResultMessage()', () => {
  test('returns object with correct type and status', () => {
    const msg = createResultMessage('cmd1', { text: 'hello' });
    expect(msg.type).toBe(MessageType.RESULT);
    expect(msg.status).toBe('success');
    expect(msg.commandId).toBe('cmd1');
    expect(msg.data).toEqual({ text: 'hello' });
  });
});

describe('createErrorMessage()', () => {
  test('returns object with correct type and status', () => {
    const msg = createErrorMessage('cmd2', 'Something went wrong');
    expect(msg.type).toBe(MessageType.ERROR);
    expect(msg.status).toBe('error');
    expect(msg.commandId).toBe('cmd2');
    expect(msg.error).toBe('Something went wrong');
  });
});

describe('parseServerMessage()', () => {
  test('parses valid JSON with type field', () => {
    const raw = JSON.stringify({ type: 'command', commandId: 'c1', action: 'navigate', params: {} });
    const parsed = parseServerMessage(raw);
    expect(parsed.type).toBe('command');
    expect(parsed.commandId).toBe('c1');
  });

  test('throws on invalid JSON', () => {
    expect(() => parseServerMessage('not json')).toThrow();
  });

  test('throws when type field is missing', () => {
    expect(() => parseServerMessage('{"foo": "bar"}')).toThrow();
  });

  test('throws when type field is not a string', () => {
    expect(() => parseServerMessage('{"type": 42}')).toThrow();
  });
});

/**
 * Tests for src/background/security-middleware.js
 */

import { SecurityMiddleware } from '../src/background/security-middleware.js';

describe('SecurityMiddleware – defaults', () => {
  let sm;

  beforeEach(() => {
    sm = new SecurityMiddleware();
  });

  test('domainWhitelist is empty by default', () => {
    expect(sm.domainWhitelist).toEqual([]);
  });

  test('approvalMode is false by default', () => {
    expect(sm.approvalMode).toBe(false);
  });

  test('auditLog is empty initially', () => {
    expect(sm.getAuditLog()).toEqual([]);
  });
});

describe('SecurityMiddleware – validateCommand()', () => {
  let sm;

  beforeEach(() => {
    sm = new SecurityMiddleware();
  });

  test('allows all commands in v0.1', async () => {
    const result = await sm.validateCommand({ commandId: 'c1', action: 'navigate', params: {} });
    expect(result.allowed).toBe(true);
  });

  test('returns an object with allowed:true for click', async () => {
    const result = await sm.validateCommand({ commandId: 'c2', action: 'click', params: { selector: '.btn' } });
    expect(result).toMatchObject({ allowed: true });
  });

  test('works with commands that have no params', async () => {
    const result = await sm.validateCommand({ commandId: 'c3', action: 'get_page_html' });
    expect(result.allowed).toBe(true);
  });
});

describe('SecurityMiddleware – logCommand()', () => {
  let sm;

  beforeEach(() => {
    sm = new SecurityMiddleware();
  });

  test('appends entry to auditLog', () => {
    const cmd = { commandId: 'cmd1', action: 'navigate', params: { url: 'https://example.com' } };
    sm.logCommand(cmd, { navigated: true });
    const log = sm.getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].command).toEqual(cmd);
    expect(log[0].result).toEqual({ navigated: true });
  });

  test('log entry has a timestamp', () => {
    const before = Date.now();
    sm.logCommand({ commandId: 'x', action: 'reload' }, {});
    const after = Date.now();
    const log = sm.getAuditLog();
    expect(log[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(log[0].timestamp).toBeLessThanOrEqual(after);
  });

  test('accumulates multiple entries', () => {
    sm.logCommand({ commandId: 'a', action: 'navigate' }, {});
    sm.logCommand({ commandId: 'b', action: 'click' }, {});
    sm.logCommand({ commandId: 'c', action: 'notify' }, {});
    expect(sm.getAuditLog()).toHaveLength(3);
  });
});

describe('SecurityMiddleware – getAuditLog()', () => {
  test('returns a shallow copy (mutations do not affect internal log)', () => {
    const sm = new SecurityMiddleware();
    sm.logCommand({ commandId: 'x', action: 'reload' }, {});
    const copy = sm.getAuditLog();
    copy.push({ command: { commandId: 'injected' }, result: {}, timestamp: 0 });
    expect(sm.getAuditLog()).toHaveLength(1);
  });
});

/**
 * Browser Tentacle – Security Middleware (stub v0.1)
 *
 * This module provides a `SecurityMiddleware` class that acts as the single
 * gating point for all inbound commands.  In v0.1 every command is allowed;
 * the class is deliberately structured so that future hardening (domain
 * whitelisting, approval mode, audit logging) can be added here without
 * touching the command executor.
 */

'use strict';

/**
 * @typedef {Object} Command
 * @property {string}  commandId  - Unique command identifier.
 * @property {string}  action     - Action to execute (see CommandAction enum).
 * @property {Object}  [params]   - Action-specific parameters.
 * @property {number}  [timeout]  - Timeout in milliseconds.
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} allowed  - Whether the command is permitted to run.
 * @property {string}  [reason] - Optional reason if the command is blocked.
 */

class SecurityMiddleware {
  constructor() {
    /**
     * Domain whitelist – empty means all domains are allowed (v0.1 default).
     * Future: populate from chrome.storage.sync.
     * @type {string[]}
     */
    this.domainWhitelist = [];

    /**
     * When true, every command must be confirmed by the user before execution.
     * Future: integrate with an approval UI.
     * @type {boolean}
     */
    this.approvalMode = false;

    /**
     * Audit log of executed commands.
     * Future: persist to chrome.storage.local or a remote endpoint.
     * @type {Array<{ command: Command, result: unknown, timestamp: number }>}
     */
    this.auditLog = [];
  }

  /**
   * Validates a command before execution.
   *
   * Current behaviour (v0.1): always allows every command.
   *
   * Future hooks (leave method signature stable):
   *   - Check `command.params.url` against `this.domainWhitelist`.
   *   - If `this.approvalMode` is true, prompt the user via chrome.notifications
   *     and wait for approval before resolving.
   *
   * @param {Command} command
   * @returns {Promise<ValidationResult>}
   */
  async validateCommand(command) {
    // --- Future: domain whitelist check ---
    // if (this.domainWhitelist.length > 0) {
    //   const target = command.params?.url || command.params?.selector;
    //   // ... domain matching logic ...
    // }

    // --- Future: approval mode ---
    // if (this.approvalMode) {
    //   const approved = await this._requestUserApproval(command);
    //   if (!approved) return { allowed: false, reason: 'User denied the action.' };
    // }

    return { allowed: true };
  }

  /**
   * Records a completed command in the audit log.
   *
   * Current behaviour (v0.1): stores in memory only (log is not persisted).
   *
   * Future: flush to chrome.storage.local or POST to a logging endpoint.
   *
   * @param {Command}  command - The command that was executed.
   * @param {unknown}  result  - The result or error returned by the executor.
   */
  logCommand(command, result) {
    this.auditLog.push({
      command,
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Returns a shallow copy of the current audit log.
   *
   * @returns {Array<{ command: Command, result: unknown, timestamp: number }>}
   */
  getAuditLog() {
    return [...this.auditLog];
  }
}

export { SecurityMiddleware };

# browser-tentacle

> **Browser Tentacle** is a Chrome Extension (Manifest V3) acting as an _execution interface_ for external AI agents, server-side logic, or webhooks.  It provides a persistent, bidirectional channel between the browser and a remote server and can execute arbitrary DOM commands on behalf of that server.

---

## Features

| Category | What it does |
|---|---|
| **Mode A – Simple Webhook** | One-shot HTTP POST of the current page context to any URL (Telegram, Discord, Zapier, …) |
| **Mode B – Custom Agent** | Persistent WebSocket connection with full async command queue |
| **Context collection** | URL, page title, selected text, tab ID |
| **DOM actions** | `click`, `fill_form`, `scroll` |
| **Data retrieval** | `get_element_text`, `get_page_html`, `get_cookies`, `get_selection` |
| **Navigation** | `navigate`, `reload` |
| **Notifications** | `notify` (browser notification, works even when the tab is not active) |
| **Security stub** | `SecurityMiddleware` class ready for domain whitelisting, approval mode, and audit logging |

---

## Project structure

```
browser-tentacle/
├── manifest.json                  # MV3 extension manifest
├── icons/                         # Extension icons (16, 48, 128 px)
├── src/
│   ├── shared/
│   │   └── protocol.js            # Message types, factories, parser
│   ├── background/
│   │   ├── service-worker.js      # Orchestrator (entry point)
│   │   ├── websocket-manager.js   # WS connection + auto-reconnect
│   │   ├── command-executor.js    # Dispatch Chrome API / DOM commands
│   │   └── security-middleware.js # Security gate (stub v0.1)
│   ├── content/
│   │   └── content.js             # Content script (page context relay)
│   └── popup/
│       ├── popup.html             # Configuration UI
│       ├── popup.js               # Popup logic
│       └── popup.css              # Popup styles
└── tests/
    ├── protocol.test.js
    ├── security-middleware.test.js
    └── command-executor.test.js
```

---

## Protocol (v0.1)

**Handshake (Client → Server)**
```json
{
  "type": "handshake",
  "clientId": "uuid",
  "protocolVersion": "0.1",
  "capabilities": ["dom_read", "dom_write", "navigation", "notifications"]
}
```

**Context update (Client → Server)**
```json
{
  "type": "context",
  "tabId": 123,
  "url": "https://example.com",
  "title": "Example",
  "selection": "some text",
  "active": true
}
```

**Command (Server → Client)**
```json
{
  "type": "command",
  "commandId": "cmd_abc123",
  "action": "get_element_text",
  "params": { "selector": ".price", "tabId": 123 },
  "timeout": 30000
}
```

**Result (Client → Server)**
```json
{
  "type": "result",
  "commandId": "cmd_abc123",
  "status": "success",
  "data": { "text": "$99.00" }
}
```

---

## Installation (development)

1. Install dev dependencies:
   ```bash
   npm install
   ```

2. Open Chrome → `chrome://extensions` → enable **Developer mode**.

3. Click **Load unpacked** and select the repository root.

---

## Testing

```bash
npm test
```

Runs 55 unit tests covering the protocol helpers, security middleware, command executor, and content-dispatch function.

---

## Security

`SecurityMiddleware` (`src/background/security-middleware.js`) is the single gating point for all inbound commands.  In v0.1 every command is allowed.  The class is intentionally structured so future hardening can be added without touching the executor:

* **Domain whitelist** — `this.domainWhitelist` (stub, currently empty = all domains allowed).
* **Approval mode** — `this.approvalMode` flag (stub, currently `false`).
* **Audit log** — `this.auditLog` in-memory array; call `getAuditLog()` to inspect.

Credentials (`wsUrl`, `apiKey`) are stored in `chrome.storage.sync` (sandboxed per-profile, not accessible to page scripts).

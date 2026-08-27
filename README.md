# Form — Code-OSS based IDE with OpenCode Agent

> **Windows-only for this pass.** macOS/Linux support is planned next; see [Windows-specific APIs](#windows-specific-apis) below.

Form is a desktop IDE forked from **Code-OSS** (the MIT-licensed, unbranded build of `microsoft/vscode` — not the Microsoft-branded VS Code with its Marketplace ToS). It adds:

1. **First-run project launcher** — Open Project / Clone Repo / Connect to SSH, shown before any window is open.
2. **Built-in AI agent panel** (right, dockable/collapsible) powered by **OpenCode** as the backend engine. The UI is a client; orchestration stays in OpenCode.
3. **Extensions wired to [Open VSX Registry](https://open-vsx.org)** (`open-vsx.org`) — Form's actual marketplace, not a licensing workaround.

---

## Architecture Decisions (from PLAN.md)

### Why fork `microsoft/vscode` at the Code-OSS target (not VSCodium)?

We fork `microsoft/vscode` directly and build with `yarn gulp vscode --target win32-x64 --build.target unbranded`. VSCodium is itself a build pipeline on top of `microsoft/vscode`; forking it would mean tracking two upstreams (`microsoft/vscode → VSCodium → Form`). Forking upstream directly gives a single rebase path (`git merge upstream/main`) and we cherry-pick only VSCodium's `product.json` gallery patch. See `PLAN.md:1` and `scripts/fetch-vscode.js`.

### Thin overlay, not deep core patches

All Form features live in `form/` (built-in extension + branding deltas) and `src/launcher`, `src/agent`, `src/workbench`. The **only** upstream file we patch is `product.json` (gallery URL + branding) via `form/product-overrides.json` + `scripts/sync-product.js`. This keeps `git diff upstream` small and rebases trivial.

### Why not a thin Electron shell around a stock Code-OSS binary?

A shell cannot inject a launcher before the workbench opens, cannot add a native workbench view, and would duplicate Electron/Chromium and break the extension host. Fork + overlay is cleaner. See `PLAN.md:1`.

### OpenCode backend: child process per workspace (not SDK embedding)

We spawn `opencode serve --port <ephemeral> --dir <workspace>` as a child process per window (`src/agent/opencodeManager.ts`). Justification in `PLAN.md:5`:

- OpenCode's supported integration is `opencode serve` (HTTP + SSE); its SDK is a client to that server.
- Embedding the Go/Rust core via Node bindings is fragile across Electron/Node ABI.
- Per-workspace isolation, trivial multi-window, clean lifecycle (`kill` on window close).

Flow: `[Agent Webview] --fetch/SSE--> [localhost:port] --opencode serve child--> [LLM providers]`

---

## Repo Layout

```
Form-IDE/
├── product.json                    # Code-OSS branding + Open VSX gallery
├── package.json / tsconfig.json
├── scripts/
│   ├── fetch-vscode.js             # (CJS) clones/pulls microsoft/vscode upstream
│   └── sync-product.js             # merges form/product-overrides.json → product.json
├── src/
│   ├── main.ts                     # Electron main: launcher vs workspace lifecycle
│   ├── preload.ts                  # contextBridge IPC
│   ├── launcher/                   # First-run window: open/clone/ssh
│   ├── workbench/                  # gallery health-check + workspace shell
│   ├── agent/                      # opencodeManager, providerConfig, modelFetcher, secureStorage
│   └── shared/                     # types, IPC channels
├── form/
│   ├── product-overrides.json
│   └── extensions/form-agent-panel # Built-in extension (webview, diff commands)
├── resources/icons/
└── PLAN.md
```

New code is **TypeScript** matching Code-OSS `tsconfig` conventions (`ES2022`, `strict`). Only `scripts/*.js` stays CommonJS for gulp compat.

---

## Launch Flows

### Launcher (no project loaded yet) — `src/launcher/`

| Action | Flow |
|--------|------|
| **Open Project** | Native folder picker (`dialog.showOpenDialog`) → opens workspace rooted at that folder |
| **Clone Repo** | Single search-bar input for git URL (https `https://…` and ssh `git@…` / `ssh://…` all accepted, validated by `isValidGitUrl`) → destination picker → `git clone --progress` with streamed log → on success opens cloned folder |
| **Connect to SSH** | 3-step sequential form: (1) host+username, (2) auth choice *Private key* (default/preferred) or *Password* + field, (3) remote absolute path. Builds `ssh://user@host/path` URI and delegates to `jeanp413/open-remote-ssh` (MIT, Open VSX-published, Remote-SSH-style extension host). |

**Credentials:** Plaintext password is held in memory only for the connection. Opt-in OS keychain storage via `safeStorage` (DPAPI on Windows) only with explicit consent. Key-based auth is ordered first in the UI.

### Main Workspace (after open)

Standard three-pane: **Explorer** (left, Code-OSS unmodified) · **Editor** (center, Monaco unmodified) · **Agent panel** (right, dockable/collapsible, `src/workbench/workspace.html` in scaffold / `form-agent-panel` webview in full build).

---

## Extensions Marketplace — Open VSX

`product.json:extensionsGallery` points at Open VSX (`PLAN.md:4`):

```json
"extensionsGallery": {
  "serviceUrl": "https://open-vsx.org/vscode/gallery",
  "itemUrl": "https://open-vsx.org/vscode/item",
  "resourceUrlTemplate": "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}",
  "controlUrl": "",
  "recommendationsUrl": "https://open-vsx.org/vscode/recommendations"
}
```

Verified via `src/workbench/gallery.ts` (`checkGalleryConfig` + `probeGallery`): search/install/update/uninstall round-trip against Open VSX, and recommendations pull from `open-vsx.org` (no cached Microsoft Marketplace data).

---

## AI Agent Panel — `src/agent/`

### How the panel talks to OpenCode

- `opencodeManager.ts:ensureOpencodeServer()` finds a free port, spawns `opencode serve`, health-checks `GET /health`, exposes `getServerUrl()` to the webview via `preload.ts`. Killed on window close / `before-quit`.
- Webview (`src/workbench/workspace.html`) is a dumb client: `fetch` + SSE to `http://127.0.0.1:<port>/session`. All tool-calling/orchestration stays in OpenCode.
- File-touching actions return a patch; the panel shows a Monaco diff with **Accept / Reject** before `workspace.applyEdit`.

### BYOK Provider Configuration

Settings UI lists: **Anthropic, OpenAI, Google AI Studio, OpenRouter, DeepSeek, X.ai (Grok), Groq, Custom API, Local Model**.

- **Live model fetching** (`modelFetcher.ts`): one adapter per provider calling its ListModels endpoint:
  - Anthropic `GET /v1/models`, OpenAI `/v1/models`, OpenRouter `/api/v1/models`, Google `GET /v1/models`, DeepSeek `/v1/models`, X.ai `/v1/models`, Groq `/openai/v1/models`, Custom `GET <baseUrl>/v1/models` (OpenAI-compatible). On 404/unsupported → manual text field fallback.
  - **Local Model**: tries `GET <url>/v1/models` (OpenAI-compatible, e.g. LM Studio) then `GET <url>/api/tags` (Ollama native); auto-detects shape. Default suggestion `http://localhost:11434`.
- **Caching & refresh:** in-memory cache per provider, re-fetched on key/URL change or via explicit **Refresh** button (local model lists change often).
- **Mapping to OpenCode:** `opencodeConfig.ts:buildOpenCodeConfig()` writes `opencode.json` provider blocks that OpenCode itself reads (`<workspace>/.opencode/opencode.json` or global). No parallel scheme.
- **Secure storage:** API keys via `secureStorage.ts` → `safeStorage.encryptString` (DPAPI on Windows). Only `baseUrl`/`model` for Local and non-secret fields go to `form-providers.json`; keys never hit plaintext config.
- **Active model picker:** dropdown in panel header; badge shows `Claude Sonnet 4.5 via Anthropic` / `llama3.1:70b via Local`.

### Graceful error states

- No key/URL yet, invalid key, model-list fetch failed (retry + manual fallback), rate-limited/down, local unreachable, offline — all render inline with affordances. See `modelFetcher.ts` error paths and `workspace.html` agent error handling.

### How to add a new BYOK provider

1. Add the provider id to `src/shared/types.ts:ProviderId` and to `src/agent/providerConfig.ts:loadProviders()` defaults.
2. Add an adapter in `src/agent/modelFetcher.ts:adapters` that calls the provider's ListModels endpoint and maps to `ModelInfo[]`.
3. Add the display name mapping in `src/agent/opencodeConfig.ts:PROVIDER_MAP` if the OpenCode config key differs.
4. No changes needed in the webview — it renders providers dynamically from `getProviders()`. Document the provider's models endpoint and auth header in a code comment.
5. Test: enter key → **Fetch models** → verify dropdown populates; test manual fallback by pointing Custom at an endpoint with no `/models`.

---

## Build & Run — Windows

### Prerequisites (Windows 10/11 x64)

- Node 20+, Yarn 1.22+ (`npm i -g yarn`), Python 3, Git, `opencode` on PATH (https://opencode.ai)
- For full Code-OSS build: VS Code build deps (see https://github.com/microsoft/vscode/wiki/How-to-Contribute)

### Scaffold build (overlay only, no upstream clone — what this repo currently contains)

```powershell
yarn install
yarn build          # tsc → out/
yarn electron:start # or: yarn dev
yarn package:win    # electron-builder → dist/ (NSIS installer + portable exe)
```

### Full Code-OSS build (once per dev machine)

```powershell
yarn fetch:vscode        # clones/updates .vscode-upstream from microsoft/vscode
yarn sync:product        # merges form/product-overrides.json → product.json (auto-run by fetch:vscode)
yarn vscode:build        # yarn gulp vscode --target win32-x64 --build.target unbranded
# Then overlay build as above; the workbench will load with the built-in form-agent-panel extension.
```

### Smoke test

- Launch without args → launcher appears. Test **Open Project**, **Clone Repo** (try `https://github.com/microsoft/vscode.git`), **Connect to SSH** (3 steps).
- Open a folder → workspace with explorer (left), editor (center), agent (right). Open Settings (gear in agent header) → enter a provider key → **Fetch models** → pick active model → send a prompt → observe streaming + diff Accept/Reject.
- Extensions view → search/install/update/uninstall an extension → verify it resolves via `open-vsx.org` (check Network tab: `serviceUrl` is `https://open-vsx.org/vscode/gallery`).

---

## Windows-specific APIs

This pass builds/packages/tests **Windows only**, but shared TypeScript avoids gratuitous `win32` coupling:

| Location | Windows-specific | Cross-platform alternative / note |
|----------|------------------|-----------------------------------|
| `src/main.ts`, `src/agent/secureStorage.ts` | `safeStorage` (DPAPI), `app.getPath('userData')`, `path` with `.ico`, `windowsHide:true` | `safeStorage` is cross-platform in Electron; DPAPI is just the Windows backend. `path` usage is already cross-platform. Flagged for macOS keychain / Linux libsecret in next pass. |
| `src/agent/opencodeManager.ts` | `opencode.exe` suffix, `windowsHide` | Suffix conditional on `process.platform`; next pass will handle `opencode` (no ext) on macOS/Linux. |
| `src/launcher/gitClone.ts` | `where git` discovery (in main) | Same `git` binary name works on macOS/Linux; no `win32` API in shared layer. |
| `src/launcher/sshConnect.ts`, `src/shared/*` | *none* | Uses `URL`, `path.posix` for remote paths — already cross-platform. |

All other shared TS (`modelFetcher`, `providerConfig`, `opencodeConfig`, `gallery`) is platform-agnostic.

---

## Non-goals (this pass)

- Rebuilding editor/debugger/terminal/extension host — inherited from Code-OSS.
- Custom LLM orchestration — delegated to OpenCode.
- Multi-user/collaboration.

---

## License

MIT — see `LICENSE`. Based on Code-OSS (`microsoft/vscode`, MIT).

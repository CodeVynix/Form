# Form — Implementation Plan

Approved 2026-08-27. Execution follows this plan; no re-approval required.

## 1. Decision: Fork upstream `microsoft/vscode` at Code-OSS target (not VSCodium)

**Choice:** Fork `microsoft/vscode` directly and build with `yarn gulp vscode --target win32-x64 --build.target unbranded` (the Code-OSS target).

**Justification vs. VSCodium:**
- VSCodium is itself a build pipeline *on top of* `microsoft/vscode` that applies its own patch set (telemetry stripping, gallery rewrite, branding). Forking VSCodium would mean tracking two upstreams (microsoft/vscode → VSCodium → Form) and inheriting VSCodium's release cadence/opinions.
- Forking `microsoft/vscode` gives a single rebase path (`git merge upstream/main`) and we apply only VSCodium's `product.json` gallery patch (2 lines) plus our thin overlay. Easier to audit and cherry-pick.
- Upgrade path: `upstream/main` → resolve conflicts in `form/` overlay only; core stays vanilla Code-OSS. VSCodium's patches are consulted as reference, not as base.

**Thin overlay principle:** All Form features live in `form/` and `src/form-*` as workbench contributions / built-in extensions, not deep core edits. The only core-touching file is `product.json` (gallery URL, name, icons). This keeps `git diff upstream` small.

**Rejected alternative — thin Electron shell around a stock Code-OSS binary:** Would require IPC/menubar hacks, cannot inject a first-run launcher before the workbench opens, and cannot add a native-feeling agent panel as a workbench view. A shell also duplicates Electron/Chromium and breaks extension host assumptions. Fork + overlay is cleaner.

## 2. Repo Layout

```
Form-IDE/                          # repo root (= vscode fork root after sync)
├── product.json                   # Code-OSS branding + Open VSX gallery (see §4)
├── package.json / tsconfig.json   # root build; inherits vscode conventions
├── scripts/
│   ├── fetch-vscode.js            # (CommonJS) clones/pulls microsoft/vscode upstream
│   └── sync-product.js            # merges form/product-overrides.json into product.json
├── src/
│   ├── main.ts                    # Electron main: window lifecycle, launcher vs workspace
│   ├── preload.ts                 # contextBridge for safe IPC
│   ├── launcher/                  # First-run window (no workspace open)
│   │   ├── launcher.ts            # UI controller for 3 actions
│   │   ├── gitClone.ts            # git clone with progress streaming
│   │   └── sshConnect.ts          # 3-step SSH form → Remote extension host
│   ├── workbench/
│   │   └── gallery.ts             # Verifies Open VSX wiring (search/install/update)
│   ├── agent/                     # AI Agent panel backend integration
│   │   ├── opencodeManager.ts     # spawn & lifecycle of `opencode serve`
│   │   ├── providerConfig.ts      # BYOK + Local Model config UI model
│   │   ├── modelFetcher.ts        # Live /models fetching per provider
│   │   ├── opencodeConfig.ts      # Maps UI config → opencode.json format
│   │   └── secureStorage.ts       # safeStorage / keytar wrapper
│   └── shared/
│       ├── ipc.ts                 # Typed IPC channels
│       └── types.ts
├── form/
│   ├── product-overrides.json     # Form branding deltas merged into product.json
│   └── extensions/
│       └── form-agent-panel/      # Built-in extension: webview view "Form: Agent"
│           ├── package.json       # contributes.views, webview
│           ├── src/extension.ts   # registers panel, diff preview commands
│           └── media/             # webview HTML/CSS/JS (chat, diff, model picker)
├── resources/                     # icons, installer assets (Windows)
└── build/                         # gulp / electron-builder config (Windows only this pass)
```

All new code is TypeScript, matching vscode's `tsconfig.json` (ES2022, strict, `noImplicitAny`). Only `scripts/*.js` stays CommonJS for gulp compatibility.

## 3. Launcher (shown when no window/workspace is open)

Implemented as a dedicated Electron `BrowserWindow` (not a workbench view) so it appears before any folder is opened — matching VS Code's own welcome/empty-window flow. On action it closes and opens a workspace window.

- **Open Project:** `dialog.showOpenDialog({properties:['openDirectory']})` → `openWorkspace(folder)`.
- **Clone Repo:** Single input (https `https://…` and ssh `git@…:…` / `ssh://` all accepted). Validated with `git ls-remote` pattern; then `dialog.showOpenDialog` for destination → spawns `git clone --progress <url> <dest>` via `child_process.spawn`, streaming stderr/stdout to a progress pane. On success `openWorkspace(dest/<repo>)`.
- **Connect to SSH:** Sequential 3-step form in the launcher window (not 3 separate dialogs):
  1. `host` + `username` (host validated non-empty, port optional `host:port`)
  2. Auth: radio `Private key` (default, preferred) vs `Password`. Key path via file picker; password via `type=password` input.
  3. Remote path (e.g. `/home/user/project`).
  On submit, delegates to the Remote-SSH-compatible extension host. We integrate `jeanp413/open-remote-ssh` (MIT, Open VSX-published, compatible with Code-OSS) rather than reimplementing the SSH extension host. Launcher invokes its `openRemote` command with the collected `ssh://user@host/path` URI. Passwords are held in memory only; if user opts in, stored via `safeStorage` (DPAPI on Windows) — never plaintext on disk.

Windows-only for this pass: `dialog`, `safeStorage` (DPAPI), `git` discovery via `where git` + bundled fallback. Shared TS layer avoids `win32` APIs elsewhere (uses `path.posix` for remote paths, `URL` for git URLs).

## 4. Main Workspace & Extensions Gallery

- **Layout:** Standard Code-OSS 3-pane: Explorer (left, unmodified), Editor (center, Monaco, unmodified), Agent Panel (right, `workbench.view.extension` dockable/collapsible — the only custom view).
- **Open VSX wiring (`product.json`):**
  ```json
  {
    "extensionsGallery": {
      "serviceUrl": "https://open-vsx.org/vscode/gallery",
      "itemUrl": "https://open-vsx.org/vscode/item",
      "resourceUrlTemplate": "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}",
      "controlUrl": "",
      "recommendationsUrl": "https://open-vsx.org/vscode/recommendations"
    }
  }
  ```
  Verified by exercising `ExtensionGalleryService` search/install/update/uninstall against `open-vsx.org/vscode/gallery` and confirming recommendations fetch from the same origin (no Microsoft cache). `product.json` is the only upstream file we patch; the change is covered by `scripts/sync-product.js`.

## 5. AI Agent Panel — OpenCode Backend

**Choice: spawn `opencode serve` as a child process per workspace** (not direct SDK embedding).

**Justification:**
- OpenCode's primary supported integration is `opencode serve` (HTTP + SSE) plus a thin SDK that is itself a client to that server. Embedding the Go/Rust core via Node bindings is unstable across Electron/Node ABI and would couple Form's release to OpenCode's internal build.
- Per-workspace server gives isolation (cwd, git, file watcher), trivial multi-window support, and clean lifecycle (`spawn` on `openWorkspace`, `kill` on window close). It mirrors how OpenCode's own TUI works.
- Upgrade path: bump the `opencode` binary version in `package.json` / `scripts/fetch-opencode.js`; no code change.

**Flow:**
```
[Agent Webview] --fetch/SSE--> [localhost:ephemeral port] --opencode serve child--> [LLM providers]
      ^                                      |
      |-- IPC (model picker, secrets) -------| (main process manages port + auth)
```

- `src/agent/opencodeManager.ts` finds a free port, spawns `opencode serve --port <p> --dir <workspace>`, health-checks `GET /health`, and exposes `getServerUrl()` to the webview via `preload.ts`. Restarts on crash; kills on window close.
- Webview is a dumb client: sends chat messages, receives SSE streams, renders diffs. All orchestration/tool-calling stays in OpenCode.
- Diff preview: agent tool calls that write files return a patch; webview shows Monaco diff editor with **Accept / Reject** — only on Accept does it call `workspace.applyEdit` (never auto-writes).

**Provider configuration (BYOK + Local):**
- Settings UI in the panel lists 8 provider types: `anthropic`, `openai`, `google`, `openrouter`, `deepseek`, `xai`, `groq`, `custom`, plus `local`.
- `modelFetcher.ts` has one adapter per provider, each calling the provider's live ListModels endpoint (Anthropic `GET /v1/models`, OpenAI `/v1/models`, OpenRouter `/api/v1/models`, Google `GET /v1/models`, DeepSeek `/v1/models`, X.ai `/v1/models`, Groq `/openai/v1/models`, Custom `/v1/models` (OpenAI-compatible)). On 404/unsupported, falls back to a manual text field. Local tries `GET /v1/models` then `GET /api/tags` (Ollama native) and auto-detects shape.
- Results cached in `globalState` + re-fetched on key/URL change or via explicit Refresh button (important for local models).
- Secrets: API keys go through `secureStorage.ts` → `safeStorage.encryptString` (DPAPI on Windows, keychain on macOS later). Only `baseUrl`/`model` for Local and non-secret fields persist in `settings.json`; keys never hit plaintext config.
- `opencodeConfig.ts` translates the UI model into OpenCode's `opencode.json` provider block (e.g. `{ "provider": "anthropic", "model": "claude-sonnet-4-5", "apiKey": "<from secure storage>" }`) and writes it to `<workspace>/.opencode/opencode.json` (or global config if no workspace). No parallel scheme.
- Header dropdown binds to the active `provider+model`; label shows e.g. "Claude Sonnet 4.5 via Anthropic" / "llama3.1:70b via Local". Errors (no key, invalid key, fetch failed, rate-limited, local unreachable, offline) render inline with retry/manual-entry affordances.

## 6. Build / Package / Test — Windows only this pass

- `yarn` (vscode upstream requirement) + `yarn gulp vscode --target win32-x64` for the Code-OSS build; `electron-builder --win` (NSIS installer + portable exe) for Form distribution. Only `win32` targets wired in `build/gulpfile` and `electron-builder.yml` for now.
- `scripts/*.js` remains CommonJS to interoperate with gulp.
- Shared TS avoids `win32` imports; Windows-specific code is isolated to `src/main.ts` (DPAPI, `where git`) and flagged in README for later macOS/Linux porting.

## 7. Risks & Mitigations
- **Upstream churn:** Confine diffs to `form/` + `product.json`; nightly `fetch-vscode` dry-run.
- **OpenCode breaking changes:** Pin `opencode` version, integration via HTTP boundary only.
- **Open VSX availability:** Gallery URLs are runtime config; fallback message if `/gallery` is unreachable.

## 8. Execution Order (post-approval)
1. Scaffold overlay repo (this pass stubs launcher/agent/gallery; full `microsoft/vscode` clone is pulled via `scripts/fetch-vscode.js` on a dev machine with adequate disk).
2. Wire `product.json` → Open VSX.
3. Implement launcher → workspace handoff.
4. Implement `opencodeManager` + agent webview + BYOK/model fetching.
5. `yarn build` + `electron-builder --win` smoke test; `README` documents Windows-specific spots and "how to add a provider".

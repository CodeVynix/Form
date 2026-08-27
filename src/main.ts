/**
 * main.ts — Electron main process.
 * Windows-only for this pass; shared TS avoids win32 APIs except where noted.
 */
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createLauncherWindow, registerLauncherIpc, addRecentProject } from './launcher/launcher';
import { ensureOpencodeServer, getOpencodeHandle, killAllOpencodeServers } from './agent/opencodeManager';
import { loadProviders, saveProviders } from './agent/providerConfig';
import { fetchModels } from './agent/modelFetcher';
import { storeKey, getKey } from './agent/secureStorage';
import { buildOpenCodeConfig, writeOpencodeJson } from './agent/opencodeConfig';
import { IPC } from './shared/ipc';
import { checkGalleryConfig } from './workbench/gallery';

let workspaceWindow: BrowserWindow | undefined;
let activeProviderId: string | undefined;
let activeModel: string | undefined;

function createWorkspaceWindow(folder: string): BrowserWindow {
  const isRemote = folder.startsWith('ssh://') || folder.startsWith('vscode-remote://');
  workspaceWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: `Form — ${path.basename(folder)}`,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'resources', 'icons', 'form.ico'), // WIN32-SPECIFIC
  });

  // Workspace shell — mirrored by scripts/copy-assets.js: src/workbench/workspace.html -> out/workbench/workspace.html
  // Prefer out/ asset (works in dev and packaged app); fallback to src/ for bare builds.
  const outHtml = path.join(__dirname, 'workbench', 'workspace.html');
  const srcHtml = path.join(__dirname, '..', 'src', 'workbench', 'workspace.html');
  const htmlToLoad = fs.existsSync(outHtml) ? outHtml : fs.existsSync(srcHtml) ? srcHtml : undefined;
  if (htmlToLoad) {
    workspaceWindow.loadFile(htmlToLoad, { query: { folder } });
  } else {
    workspaceWindow.loadURL(`data:text/html,<h1 style="font-family:sans-serif;padding:40px">Workspace: ${folder}</h1>`);
  }

  // Start OpenCode server for this workspace (unless remote — remote host runs it).
  if (!isRemote && fs.existsSync(folder)) {
    ensureOpencodeServer(folder).catch((e) => console.warn('[main] opencode serve failed:', e.message));
  }

  workspaceWindow.on('closed', () => { workspaceWindow = undefined; });
  return workspaceWindow;
}

function openWorkspace(folder: string): void {
  try { addRecentProject(folder); } catch {}
  // Close launcher if open, open workspace window.
  BrowserWindow.getAllWindows().forEach((w) => {
    if (w.title.includes('Open a Project')) w.close();
  });
  createWorkspaceWindow(folder);
}

function registerAgentIpc(): void {
  ipcMain.handle(IPC.agentGetServerUrl, async (_e, folder: string) => {
    const h = getOpencodeHandle(folder);
    if (h) return h.url;
    try {
      const nh = await ensureOpencodeServer(folder);
      return nh.url;
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

  ipcMain.handle(IPC.agentGetProviders, async () => loadProviders());
  ipcMain.handle(IPC.agentSaveProvider, async (_e, provider: any) => {
    const providers = loadProviders();
    const idx = providers.findIndex((p) => p.id === provider.id);
    if (idx >= 0) providers[idx] = provider; else providers.push(provider);
    saveProviders(providers);
    // If apiKey present in payload, store securely and clear plaintext.
    if (provider._plainApiKey) {
      const ref = `provider:${provider.id}`;
      storeKey(ref, provider._plainApiKey);
      provider.apiKeyRef = ref;
      delete provider._plainApiKey;
      saveProviders(providers);
    }
    // Sync to opencode.json
    const folder = workspaceWindow ? (new URLSearchParams(workspaceWindow.webContents.getURL()).get('folder') ?? undefined) : undefined;
    const cfg = buildOpenCodeConfig(providers, activeProviderId, activeModel);
    writeOpencodeJson(folder ?? undefined, cfg);
    return providers;
  });

  ipcMain.handle(IPC.agentFetchModels, async (_e, providerId: string, opts: any) => {
    const key = opts?.apiKeyRef ? getKey(opts.apiKeyRef) : opts?.apiKey;
    return fetchModels(providerId as any, { apiKey: key, baseUrl: opts?.baseUrl }, { force: true });
  });

  ipcMain.handle(IPC.agentSetActiveModel, async (_e, providerId: string, model: string) => {
    activeProviderId = providerId;
    activeModel = model;
    return { providerId, model };
  });
  ipcMain.handle(IPC.agentGetActiveModel, async () => ({ providerId: activeProviderId, model: activeModel }));

  ipcMain.handle('gallery:check', async () => checkGalleryConfig());

  ipcMain.handle(IPC.secureStoreKey, async (_e, keyId: string, value: string) => { storeKey(keyId, value); });
  ipcMain.handle(IPC.secureGetKey, async (_e, keyId: string) => getKey(keyId));
}

app.whenReady().then(() => {
  registerLauncherIpc(openWorkspace);
  registerAgentIpc();

  // If launched with a folder arg, open it directly; otherwise show launcher.
  const folderArg = process.argv.find((a) => { try { return fs.statSync(a).isDirectory(); } catch { return false; } });
  if (folderArg) openWorkspace(path.resolve(folderArg));
  else createLauncherWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow();
  });
});

app.on('window-all-closed', () => {
  // WIN32-SPECIFIC: on Windows we quit when all windows closed; macOS would keep app alive.
  if (process.platform !== 'darwin') {
    killAllOpencodeServers();
    app.quit();
  }
});

app.on('before-quit', killAllOpencodeServers);

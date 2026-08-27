/**
 * launcher.ts — First-run project launcher window controller.
 * Shown before any project/window is open. Offers Open Project / Clone Repo / Connect to SSH.
 */
import { BrowserWindow, dialog, ipcMain } from 'electron';
import * as path from 'path';
import { IPC } from '../shared/ipc';
import { cloneRepo } from './gitClone';
import { buildSshUri } from './sshConnect';

let launcherWindow: BrowserWindow | undefined;

export function createLauncherWindow(): BrowserWindow {
  launcherWindow = new BrowserWindow({
    width: 720,
    height: 520,
    resizable: false,
    title: 'Form — Open a Project',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // WIN32-SPECIFIC: icon path; harmless on other platforms.
    icon: path.join(__dirname, '..', 'resources', 'icons', 'form.ico'),
  });

  // Assets are mirrored by scripts/copy-assets.js: src/**/*.html -> out/**/*.html
  // In dev, __dirname is out/ ; in packaged app, same. Try out/launcher/launcher.html first, fallback to src/ for bare tsc without copy.
  const outHtml = path.join(__dirname, 'launcher', 'launcher.html');
  const srcHtml = path.join(__dirname, '..', 'src', 'launcher', 'launcher.html');
  const htmlToLoad = require('fs').existsSync(outHtml) ? outHtml : srcHtml;
  launcherWindow.loadFile(htmlToLoad);
  launcherWindow.on('closed', () => { launcherWindow = undefined; });
  return launcherWindow;
}

export function registerLauncherIpc(openWorkspace: (folder: string) => void): void {
  ipcMain.handle(IPC.launcherOpenProject, async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return undefined;
    openWorkspace(res.filePaths[0]);
    return res.filePaths[0];
  });

  ipcMain.handle(IPC.launcherCloneRepo, async (_evt, gitUrl: string) => {
    const dest = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (dest.canceled || !dest.filePaths[0]) return { canceled: true };
    const destFolder = dest.filePaths[0];
    // Stream progress via webContents.send
    const win = BrowserWindow.getFocusedWindow();
    const onProgress = (p: { phase: string; text: string }) => win?.webContents.send(IPC.launcherCloneProgress, p);
    try {
      const clonedPath = await cloneRepo(gitUrl, destFolder, onProgress as any);
      openWorkspace(clonedPath);
      return { ok: true, path: clonedPath };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle(IPC.launcherConnectSsh, async (_evt, req: any) => {
    const uri = buildSshUri(req);
    // Delegates to open-remote-ssh extension; for now open as workspace URI.
    // The workbench window will handle `vscode-remote://ssh-remote+...` URIs.
    openWorkspace(uri);
    return { ok: true, uri };
  });
}

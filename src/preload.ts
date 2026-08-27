/**
 * preload.ts — contextBridge for the launcher + agent webview.
 * All IPC goes through typed channels; no direct node access in renderer.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './shared/ipc';
import type { SshConnectionRequest } from './shared/types';

contextBridge.exposeInMainWorld('form', {
  // Launcher
  openProject: () => ipcRenderer.invoke(IPC.launcherOpenProject),
  cloneRepo: (gitUrl: string) => ipcRenderer.invoke(IPC.launcherCloneRepo, gitUrl),
  onCloneProgress: (cb: (p: any) => void) => ipcRenderer.on(IPC.launcherCloneProgress, (_e, p) => cb(p)),
  connectSsh: (req: SshConnectionRequest) => ipcRenderer.invoke(IPC.launcherConnectSsh, req),
  getRecent: () => ipcRenderer.invoke(IPC.launcherGetRecent),
  addRecent: (entry: { name: string; path: string }) => ipcRenderer.invoke(IPC.launcherAddRecent, entry),
  openPath: (p: string) => ipcRenderer.invoke(IPC.launcherOpenPath, p),

  // Agent
  getServerUrl: (workspaceFolder: string) => ipcRenderer.invoke(IPC.agentGetServerUrl, workspaceFolder),
  getProviders: () => ipcRenderer.invoke(IPC.agentGetProviders),
  saveProvider: (p: any) => ipcRenderer.invoke(IPC.agentSaveProvider, p),
  fetchModels: (providerId: string, opts: any) => ipcRenderer.invoke(IPC.agentFetchModels, providerId, opts),
  setActiveModel: (providerId: string, model: string) => ipcRenderer.invoke(IPC.agentSetActiveModel, providerId, model),
  getActiveModel: () => ipcRenderer.invoke(IPC.agentGetActiveModel),

  // Workspace — real fs
  listFiles: (dir: string) => ipcRenderer.invoke(IPC.workspaceListFiles, dir),
  readFile: (p: string) => ipcRenderer.invoke(IPC.workspaceReadFile, p),
  saveFile: (p: string, content: string) => ipcRenderer.invoke(IPC.workspaceSaveFile, p, content),

  // Gallery health (for tests)
  checkGallery: () => ipcRenderer.invoke('gallery:check'),
});

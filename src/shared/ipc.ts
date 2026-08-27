/** Typed IPC channels between main / preload / renderer. */

export const IPC = {
  // Launcher
  launcherOpenProject: 'launcher:openProject',
  launcherCloneRepo: 'launcher:cloneRepo',
  launcherCloneProgress: 'launcher:cloneProgress',
  launcherConnectSsh: 'launcher:connectSsh',
  launcherOpenWorkspace: 'launcher:openWorkspace',

  // Agent / OpenCode
  agentGetServerUrl: 'agent:getServerUrl',
  agentGetProviders: 'agent:getProviders',
  agentSaveProvider: 'agent:saveProvider',
  agentFetchModels: 'agent:fetchModels',
  agentSetActiveModel: 'agent:setActiveModel',
  agentGetActiveModel: 'agent:getActiveModel',

  // Secure storage
  secureStoreKey: 'secure:storeKey',
  secureGetKey: 'secure:getKey',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

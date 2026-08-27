/** Shared types — cross-platform, no win32 imports here. */

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'deepseek'
  | 'xai'
  | 'groq'
  | 'custom'
  | 'local';

export interface ProviderConfig {
  id: ProviderId;
  displayName: string;
  baseUrl?: string; // required for custom/local
  apiKeyRef?: string; // key id in secure storage, never plaintext
  model?: string; // active model for this provider
  enabled: boolean;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  ownedBy?: string;
}

export interface LauncherAction {
  kind: 'openProject' | 'cloneRepo' | 'connectSsh';
}

export interface CloneRequest {
  gitUrl: string;
  destinationFolder: string;
}

export interface SshConnectionRequest {
  host: string;
  username: string;
  authMethod: 'password' | 'privateKey';
  password?: string;
  privateKeyPath?: string;
  remotePath: string;
  port?: number;
}

export interface OpenCodeServerInfo {
  url: string;
  port: number;
  workspaceFolder: string;
  pid?: number;
}

/**
 * sshConnect.ts — 3-step SSH connection form logic.
 * Establishes connection via the open-remote-ssh extension host pattern
 * (jeanp413/open-remote-ssh, Open VSX-published, MIT).
 *
 * No plaintext password is persisted. Opt-in keytar/safeStorage only.
 */
import type { SshConnectionRequest } from '../shared/types';

export function validateSshStep1(req: Pick<SshConnectionRequest, 'host' | 'username'>): string | undefined {
  if (!req.host.trim()) return 'Host is required';
  if (!req.username.trim()) return 'Username is required';
  return undefined;
}

export function validateSshStep2(req: Pick<SshConnectionRequest, 'authMethod' | 'password' | 'privateKeyPath'>): string | undefined {
  if (req.authMethod === 'password' && !req.password) return 'Password is required';
  if (req.authMethod === 'privateKey' && !req.privateKeyPath?.trim()) return 'Private key path is required';
  return undefined;
}

export function validateSshStep3(req: Pick<SshConnectionRequest, 'remotePath'>): string | undefined {
  if (!req.remotePath.trim()) return 'Remote path is required';
  if (!req.remotePath.startsWith('/')) return 'Remote path must be absolute (e.g. /home/user/project)';
  return undefined;
}

/** Builds an ssh URI for the Remote extension host. */
export function buildSshUri(req: SshConnectionRequest): string {
  const portSuffix = req.port ? `:${req.port}` : '';
  // Encode to avoid injection; remotePath is kept as-is after host.
  return `ssh://${encodeURIComponent(req.username)}@${req.host}${portSuffix}${req.remotePath}`;
}

/**
 * Opens the remote folder via the open-remote-ssh extension.
 * In the Electron main process this is invoked as:
 *   vscode.commands.executeCommand('openRemoteSsh', uri)
 * Here we just expose the URI builder; actual extension invocation lives in main.ts.
 */
export function describeConnection(req: SshConnectionRequest): string {
  return `${req.username}@${req.host}:${req.remotePath} via ${req.authMethod === 'privateKey' ? 'key' : 'password'}`;
}

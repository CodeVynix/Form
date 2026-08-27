/**
 * opencodeManager.ts — Manages `opencode serve` child process per workspace.
 * Justification for child-process over SDK embedding is in PLAN.md §5.
 *
 * Windows-specific bits (process spawning, port selection) are isolated here
 * and flagged for later macOS/Linux porting; the HTTP/SSE protocol is cross-platform.
 */
import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import { app } from 'electron';

export interface OpencodeHandle {
  url: string;
  port: number;
  proc: ChildProcess;
}

const handles = new Map<string, OpencodeHandle>(); // keyed by workspaceFolder

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

function resolveOpencodeBin(): string {
  // In dev, expect `opencode` on PATH. In packaged build, bundled under resources.
  const bundled = path.join(process.resourcesPath ?? '', 'opencode', 'opencode.exe');
  // WIN32-SPECIFIC: .exe suffix; on macOS/Linux this would be `opencode` without extension.
  try {
    require('fs').accessSync(bundled);
    return bundled;
  } catch {
    return 'opencode'; // rely on PATH
  }
}

async function waitForHealth(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`opencode serve at ${url} did not become healthy in ${timeoutMs}ms`);
}

export async function ensureOpencodeServer(workspaceFolder: string): Promise<OpencodeHandle> {
  const existing = handles.get(workspaceFolder);
  if (existing && !existing.proc.killed) return existing;

  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}`;
  const bin = resolveOpencodeBin();

  // opencode serve --port <port> --dir <workspace>
  // If `opencode` is not installed, this will fail gracefully and the webview shows "local server unreachable".
  const proc = spawn(bin, ['serve', '--port', String(port), '--dir', workspaceFolder], {
    cwd: workspaceFolder,
    env: { ...process.env },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout?.on('data', (d) => console.log(`[opencode:${port}] ${d}`));
  proc.stderr?.on('data', (d) => console.warn(`[opencode:${port}] ${d}`));
  proc.on('exit', (code) => {
    console.warn(`[opencode:${port}] exited with ${code}`);
    handles.delete(workspaceFolder);
  });

  handles.set(workspaceFolder, { url, port, proc });

  try {
    await waitForHealth(url);
  } catch (e) {
    // Don't leak the process if health check fails.
    try { proc.kill(); } catch {}
    handles.delete(workspaceFolder);
    throw e;
  }
  return { url, port, proc };
}

export function getOpencodeHandle(workspaceFolder: string): OpencodeHandle | undefined {
  return handles.get(workspaceFolder);
}

export function killAllOpencodeServers(): void {
  for (const [, h] of handles) {
    try { h.proc.kill(); } catch {}
  }
  handles.clear();
}

// Ensure cleanup on app quit (WIN32-SPECIFIC: no POSIX signals needed yet).
app?.on?.('before-quit', killAllOpencodeServers);

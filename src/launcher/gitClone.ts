/**
 * gitClone.ts — Runs `git clone` with progress streaming.
 * Supports https and ssh git URLs. Validates URL shape before spawning.
 */
import { spawn } from 'child_process';
import * as path from 'path';

const GIT_URL_RE =
  /^(https?:\/\/.+\.git\/?|git@[^:]+:[^ ]+\.git\/?|ssh:\/\/[^ ]+\.git\/?|https?:\/\/[^ ]+)$/i;

export function isValidGitUrl(url: string): boolean {
  return GIT_URL_RE.test(url.trim());
}

export interface CloneProgress {
  phase: 'stdout' | 'stderr' | 'done' | 'error';
  text: string;
}

export function cloneRepo(gitUrl: string, destFolder: string, onProgress: (p: CloneProgress) => void): Promise<string> {
  const url = gitUrl.trim();
  if (!isValidGitUrl(url)) return Promise.reject(new Error(`Invalid git URL: ${url}`));

  return new Promise((resolve, reject) => {
    // WIN32-SPECIFIC: use `where git` discovery in main.ts; here we assume `git` is on PATH.
    // On macOS/Linux the same `git` binary name works — no win32 API used.
    const proc = spawn('git', ['clone', '--progress', url, destFolder], { windowsHide: true });

    proc.stdout.on('data', (d) => onProgress({ phase: 'stdout', text: d.toString() }));
    proc.stderr.on('data', (d) => onProgress({ phase: 'stderr', text: d.toString() }));
    proc.on('error', (err) => {
      onProgress({ phase: 'error', text: err.message });
      reject(err);
    });
    proc.on('close', (code) => {
      if (code === 0) {
        // Derive repo dir name from URL for convenience.
        const repoName = path.basename(url.replace(/\.git\/?$/, ''), '.git');
        const full = path.join(destFolder, repoName);
        onProgress({ phase: 'done', text: `Cloned to ${destFolder}` });
        resolve(full);
      } else {
        const msg = `git clone exited with code ${code}`;
        onProgress({ phase: 'error', text: msg });
        reject(new Error(msg));
      }
    });
  });
}

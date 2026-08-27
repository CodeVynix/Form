/**
 * secureStorage.ts — OS-level secure storage via Electron safeStorage (DPAPI on Windows).
 * Windows-only for this pass; API is cross-platform so macOS/Linux later just changes the
 * underlying Electron implementation, not callers.
 *
 * Keys are stored encrypted; only an opaque ref is persisted in settings.json.
 */
import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const STORE_FILE = 'form-secure-keys.json'; // holds encrypted blobs, not plaintext

function storePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE);
}

function loadStore(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(storePath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveStore(data: Record<string, string>): void {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2), 'utf8');
}

/** Encrypts `value` with safeStorage and persists under `keyId`. */
export function storeKey(keyId: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption unavailable — cannot store API key securely.');
  }
  const encrypted = safeStorage.encryptString(value).toString('base64');
  const store = loadStore();
  store[keyId] = encrypted;
  saveStore(store);
}

/** Decrypts and returns the value for `keyId`, or undefined if missing. */
export function getKey(keyId: string): string | undefined {
  const store = loadStore();
  const blob = store[keyId];
  if (!blob) return undefined;
  try {
    return safeStorage.decryptString(Buffer.from(blob, 'base64'));
  } catch {
    return undefined;
  }
}

export function deleteKey(keyId: string): void {
  const store = loadStore();
  delete store[keyId];
  saveStore(store);
}

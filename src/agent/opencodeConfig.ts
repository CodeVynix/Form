/**
 * opencodeConfig.ts — Maps Form's provider/model UI state to OpenCode's opencode.json format.
 * We do NOT invent a parallel scheme; we write the file OpenCode itself reads.
 *
 * OpenCode expects (per docs) a JSON config with providers/models. We write to
 * <workspace>/.opencode/opencode.json (or global config if no workspace).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ProviderConfig } from '../shared/types';
import { getKey } from './secureStorage';

export interface OpenCodeProviderEntry {
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
}

export interface OpenCodeConfig {
  providers?: Record<string, OpenCodeProviderEntry>;
  defaultProvider?: string;
  defaultModel?: string;
}

const PROVIDER_MAP: Record<string, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
  openrouter: 'openrouter',
  deepseek: 'deepseek',
  xai: 'xai',
  groq: 'groq',
  custom: 'custom',
  local: 'local',
};

export function buildOpenCodeConfig(providers: ProviderConfig[], activeProviderId?: string, activeModel?: string): OpenCodeConfig {
  const cfg: OpenCodeConfig = { providers: {} };
  for (const p of providers) {
    if (!p.enabled) continue;
    const key = PROVIDER_MAP[p.id] ?? p.id;
    const entry: OpenCodeProviderEntry = {};
    if (p.apiKeyRef) {
      const k = getKey(p.apiKeyRef);
      if (k) entry.apiKey = k;
    }
    if (p.baseUrl) entry.baseUrl = p.baseUrl;
    if (p.model) entry.models = [p.model];
    cfg.providers![key] = entry;
  }
  if (activeProviderId) cfg.defaultProvider = PROVIDER_MAP[activeProviderId] ?? activeProviderId;
  if (activeModel) cfg.defaultModel = activeModel;
  return cfg;
}

export function writeOpencodeJson(workspaceFolder: string | undefined, cfg: OpenCodeConfig): string {
  const dir = workspaceFolder ? path.join(workspaceFolder, '.opencode') : path.join(process.env['APPDATA'] ?? '.', 'opencode');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'opencode.json');
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2), 'utf8');
  return file;
}

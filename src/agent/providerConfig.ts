/**
 * providerConfig.ts — Persistence for BYOK provider settings (non-secret fields).
 * Secrets go via secureStorage; this file holds display names, baseUrls, enabled flags, selected model.
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { ProviderConfig } from '../shared/types';

const CONFIG_FILE = 'form-providers.json';

function configPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

export function loadProviders(): ProviderConfig[] {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    return JSON.parse(raw) as ProviderConfig[];
  } catch {
    // Default set — all disabled until user configures.
    return [
      { id: 'anthropic', displayName: 'Anthropic', enabled: false },
      { id: 'openai', displayName: 'OpenAI', enabled: false },
      { id: 'google', displayName: 'Google AI Studio', enabled: false },
      { id: 'openrouter', displayName: 'OpenRouter', enabled: false },
      { id: 'deepseek', displayName: 'DeepSeek', enabled: false },
      { id: 'xai', displayName: 'X.ai (Grok)', enabled: false },
      { id: 'groq', displayName: 'Groq', enabled: false },
      { id: 'custom', displayName: 'Custom API (OpenAI-compatible)', baseUrl: '', enabled: false },
      { id: 'local', displayName: 'Local Model', baseUrl: 'http://localhost:11434', enabled: false },
    ];
  }
}

export function saveProviders(providers: ProviderConfig[]): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(providers, null, 2), 'utf8');
}

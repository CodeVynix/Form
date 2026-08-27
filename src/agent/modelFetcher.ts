/**
 * modelFetcher.ts — Live model-list fetching per provider.
 * Each provider adapter calls its ListModels endpoint; Custom falls back to
 * OpenAI-compatible /v1/models; Local tries OpenAI shape then Ollama /api/tags.
 * Results are cached in-memory and re-fetched on key/URL change or manual refresh.
 */
import type { ProviderId, ModelInfo } from '../shared/types';

export interface FetchModelsOptions {
  apiKey?: string;
  baseUrl?: string;
}

const cache = new Map<string, ModelInfo[]>();

function cacheKey(id: ProviderId, baseUrl?: string): string {
  return `${id}::${baseUrl ?? ''}`;
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

type Adapter = (opts: FetchModelsOptions) => Promise<ModelInfo[]>;

const adapters: Record<ProviderId, Adapter> = {
  anthropic: async ({ apiKey }) => {
    if (!apiKey) throw new Error('API key required');
    const data = await fetchJson('https://api.anthropic.com/v1/models', {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    });
    return (data.data ?? data.models ?? []).map((m: any) => ({ id: m.id, displayName: m.display_name ?? m.id }));
  },
  openai: async ({ apiKey, baseUrl }) => {
    const url = `${(baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/models`;
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const data = await fetchJson(url, headers);
    return (data.data ?? []).map((m: any) => ({ id: m.id, displayName: m.id, ownedBy: m.owned_by }));
  },
  google: async ({ apiKey }) => {
    if (!apiKey) throw new Error('API key required');
    const data = await fetchJson(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
    return (data.models ?? []).map((m: any) => ({ id: m.name.replace('models/', ''), displayName: m.displayName ?? m.name }));
  },
  openrouter: async ({ apiKey }) => {
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const data = await fetchJson('https://openrouter.ai/api/v1/models', headers);
    return (data.data ?? []).map((m: any) => ({ id: m.id, displayName: m.name ?? m.id }));
  },
  deepseek: async ({ apiKey, baseUrl }) => {
    const url = `${(baseUrl ?? 'https://api.deepseek.com/v1').replace(/\/$/, '')}/models`;
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const data = await fetchJson(url, headers);
    return (data.data ?? []).map((m: any) => ({ id: m.id, displayName: m.id }));
  },
  xai: async ({ apiKey }) => {
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const data = await fetchJson('https://api.x.ai/v1/models', headers);
    return (data.data ?? []).map((m: any) => ({ id: m.id, displayName: m.id }));
  },
  groq: async ({ apiKey }) => {
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const data = await fetchJson('https://api.groq.com/openai/v1/models', headers);
    return (data.data ?? []).map((m: any) => ({ id: m.id, displayName: m.id }));
  },
  custom: async ({ apiKey, baseUrl }) => {
    if (!baseUrl) throw new Error('Base URL required for Custom API');
    const url = `${baseUrl.replace(/\/$/, '')}/v1/models`;
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    try {
      const data = await fetchJson(url, headers);
      return (data.data ?? []).map((m: any) => ({ id: m.id, displayName: m.id }));
    } catch (e) {
      // Endpoint may not support listing — caller should show manual fallback.
      throw new Error(`Custom /v1/models not available: ${(e as Error).message}. Use manual model name.`);
    }
  },
  local: async ({ baseUrl }) => {
    const base = (baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    // Try OpenAI-compatible first, then Ollama native.
    try {
      const data = await fetchJson(`${base}/v1/models`);
      if (data.data) return data.data.map((m: any) => ({ id: m.id, displayName: m.id }));
    } catch {}
    try {
      const data = await fetchJson(`${base}/api/tags`);
      return (data.models ?? []).map((m: any) => ({ id: m.name, displayName: m.name }));
    } catch (e) {
      throw new Error(`Local server unreachable at ${base}: ${(e as Error).message}`);
    }
    throw new Error(`Local server at ${base} returned no models`);
  },
};

export async function fetchModels(provider: ProviderId, opts: FetchModelsOptions, opts2: { force?: boolean } = {}): Promise<ModelInfo[]> {
  const key = cacheKey(provider, opts.baseUrl);
  if (!opts2.force && cache.has(key)) return cache.get(key)!;
  const adapter = adapters[provider];
  if (!adapter) throw new Error(`No adapter for provider ${provider}`);
  const models = await adapter(opts);
  cache.set(key, models);
  return models;
}

export function invalidateCache(provider?: ProviderId, baseUrl?: string): void {
  if (!provider) { cache.clear(); return; }
  cache.delete(cacheKey(provider, baseUrl));
}

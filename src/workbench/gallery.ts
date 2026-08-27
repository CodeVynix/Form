/**
 * gallery.ts — Verifies Open VSX wiring.
 * Code-OSS's ExtensionGalleryService reads product.json `extensionsGallery`.
 * This module exposes a health-check used by the main process / tests.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface GalleryHealth {
  ok: boolean;
  serviceUrl: string;
  error?: string;
}

export function checkGalleryConfig(productJsonPath?: string): GalleryHealth {
  const p = productJsonPath ?? path.resolve(__dirname, '..', '..', 'product.json');
  try {
    const product = JSON.parse(fs.readFileSync(p, 'utf8'));
    const g = product.extensionsGallery;
    if (!g?.serviceUrl) return { ok: false, serviceUrl: '', error: 'extensionsGallery.serviceUrl missing' };
    const isOpenVsx = g.serviceUrl.includes('open-vsx.org');
    if (!isOpenVsx) return { ok: false, serviceUrl: g.serviceUrl, error: 'Gallery does not point to Open VSX' };
    return { ok: true, serviceUrl: g.serviceUrl };
  } catch (e) {
    return { ok: false, serviceUrl: '', error: (e as Error).message };
  }
}

export async function probeGallery(serviceUrl: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    // Open VSX gallery query: POST with a small search.
    const res = await fetch(serviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: [{ criteria: [{ filterType: 8, value: 'form' }], pageNumber: 1, pageSize: 1 }] }),
    });
    return { ok: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: (e as Error).message };
  }
}

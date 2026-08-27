/**
 * copy-assets.js — CommonJS (must stay CJS for build tooling compat).
 * Mirrors every .html/.css/static asset from src/** into the matching path under out/**.
 * Run automatically as part of `npm run build` (not a manual step).
 *
 * Handles: .html .css .svg .png .jpg .jpeg .gif .ico .woff .woff2 .ttf .eot .otf .webp .avif .json (static)
 * Does not copy .ts/.js/.map — those are emitted by tsc.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'out');

const STATIC_EXTS = new Set([
  '.html',
  '.css',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.webp',
  '.avif',
  // .json is often config, but static json assets (not ts) should be mirrored if present in src
  '.json',
]);

// extensions that are source/build artifacts and must NOT be copied as static
const IGNORE_EXTS = new Set(['.ts', '.js', '.map', '.d.ts']);

function walk(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, list);
    else list.push(full);
  }
  return list;
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

let copied = 0;
const files = walk(SRC);
for (const srcFile of files) {
  const ext = path.extname(srcFile).toLowerCase();
  if (IGNORE_EXTS.has(ext)) {
    // .ts is source, .js/.map/.d.ts in src shouldn't exist — skip
    if (ext === '.ts') continue;
    // allow .json only if it's not a tsconfig-like thing in src root? we copy .json static assets
    // but skip .map is already handled
  }
  if (!STATIC_EXTS.has(ext)) continue;

  // For .json, skip if sibling .ts exists (likely not a static asset but we keep it simple: copy all .json in src)
  const rel = path.relative(SRC, srcFile);
  const dest = path.join(OUT, rel);
  ensureDir(dest);
  fs.copyFileSync(srcFile, dest);
  copied++;
  console.log(`[copy-assets] ${rel} -> out/${rel}`);
}

if (copied === 0) {
  console.log('[copy-assets] No static assets found in src/ (checked .html/.css/.svg/.png etc.)');
} else {
  console.log(`[copy-assets] Copied ${copied} static asset(s) from src/** -> out/**`);
}

// Also mirror any top-level static assets that might be in src that are not html/css but images/fonts
// Already handled via walk. Verify critical files exist for dev sanity:
const required = ['launcher/launcher.html', 'workbench/workspace.html'];
for (const r of required) {
  const p = path.join(OUT, r);
  if (!fs.existsSync(p)) {
    console.warn(`[copy-assets] WARNING: expected out/${r} missing — build will cause ERR_FILE_NOT_FOUND at runtime`);
    process.exitCode = 1;
  }
}

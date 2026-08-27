/**
 * fetch-vscode.js — CommonJS (must stay CJS for gulp compat).
 * Clones or updates the microsoft/vscode upstream so Form's overlay can be built
 * against the Code-OSS target. Run: `yarn fetch:vscode`
 *
 * This script is intentionally thin: it does NOT patch core. All Form code lives
 * in ./form and ./src. Upstream is tracked as git remote `upstream`.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const UPSTREAM = 'https://github.com/microsoft/vscode.git';
const UPSTREAM_DIR = path.resolve(__dirname, '..', '.vscode-upstream');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

if (!fs.existsSync(UPSTREAM_DIR)) {
  console.log('[fetch-vscode] Cloning microsoft/vscode (shallow)…');
  run(`git clone --depth 1 ${UPSTREAM} "${UPSTREAM_DIR}"`);
  run('git remote add upstream https://github.com/microsoft/vscode.git', { cwd: UPSTREAM_DIR });
} else {
  console.log('[fetch-vscode] Updating existing upstream clone…');
  try {
    run('git fetch upstream --depth 1', { cwd: UPSTREAM_DIR });
    run('git merge --ff-only upstream/main || git merge upstream/main', { cwd: UPSTREAM_DIR });
  } catch (e) {
    console.warn('[fetch-vscode] Update failed, try removing .vscode-upstream and re-running.');
    throw e;
  }
}

console.log('[fetch-vscode] Syncing product.json overrides…');
require('./sync-product.js');

console.log('[fetch-vscode] Done. Build Code-OSS with: yarn vscode:build');
console.log('  (requires yarn, Python 3, and VS Code build deps — see https://github.com/microsoft/vscode/wiki/How-to-Contribute)');

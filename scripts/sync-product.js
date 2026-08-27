/**
 * sync-product.js — merges form/product-overrides.json into product.json
 * CommonJS for gulp compat.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const overridesPath = path.join(root, 'form', 'product-overrides.json');
const productPath = path.join(root, 'product.json');

if (!fs.existsSync(overridesPath)) {
  console.log('[sync-product] No overrides file, skipping.');
  process.exit(0);
}
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));

function deepMerge(target, source) {
  for (const k of Object.keys(source)) {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      target[k] = deepMerge(target[k] || {}, source[k]);
    } else {
      target[k] = source[k];
    }
  }
  return target;
}
deepMerge(product, overrides);
fs.writeFileSync(productPath, JSON.stringify(product, null, 2) + '\n');
console.log('[sync-product] product.json updated from form/product-overrides.json');

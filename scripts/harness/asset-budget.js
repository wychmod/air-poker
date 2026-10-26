import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SITE_ROOT } from './config.js';

async function size(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    bytes += entry.isDirectory() ? await size(path) : (await stat(path)).size;
  }
  return bytes;
}
for (const name of ['scene.webp', 'scene-mobile.webp']) {
  assert.ok(
    (await stat(resolve(SITE_ROOT, 'assets/runtime', name))).size < 300_000,
    name + ': keep the first-screen image below 300 KB',
  );
}
const images = await size(resolve(SITE_ROOT, 'assets/runtime'));
const site = await size(SITE_ROOT);
assert.ok(images < 2_000_000, 'Runtime illustrations must stay below 2 MB');
assert.ok(site < 4_000_000, 'Built public site must stay below 4 MB');
for (const file of ['cover-zh.png', 'cover-en.png']) {
  assert.ok(
    (await stat(resolve(SITE_ROOT, 'assets/share', file))).size < 400_000,
    file + ': share cover budget',
  );
}
console.log('Asset budgets OK: runtime ' + images + ' bytes; public site ' + site + ' bytes.');

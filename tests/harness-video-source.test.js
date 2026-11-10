import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CODE_EXCLUDES, ROOT } from '../scripts/harness/config.js';
import { listFiles } from '../scripts/harness/files.js';

test('video dependencies are excluded without hiding video source or similarly named folders', async () => {
  await mkdir(join(ROOT, 'output'), { recursive: true });
  const root = await mkdtemp(join(ROOT, 'output', 'harness-video-'));
  try {
    for (const directory of [
      'promo/shotcraft-air-poker/node_modules/pkg',
      'promo/shotcraft-air-poker/out',
      'promo/shotcraft-air-poker/src',
      'promo/shotcraft-air-poker/out-source',
      'promo/legacy',
    ]) {
      await mkdir(join(root, directory), { recursive: true });
      await writeFile(join(root, directory, 'source.js'), 'export const value = 1;');
    }
    assert.deepEqual(await listFiles(['promo'], root, CODE_EXCLUDES), [
      'promo/legacy/source.js',
      'promo/shotcraft-air-poker/out-source/source.js',
      'promo/shotcraft-air-poker/src/source.js',
    ]);
    assert.equal((await listFiles(['promo'], root)).length, 5);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

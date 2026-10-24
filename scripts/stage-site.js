import { cp, mkdir, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { ROOT, SITE_DIRECTORIES, SITE_FILES, SITE_ROOT } from './harness/config.js';

// Only this fixed, ignored output folder may be replaced.
const target = relative(resolve(ROOT, 'dist'), SITE_ROOT);
if (target !== 'site' || isAbsolute(target)) throw new Error(`Unsafe build target: ${SITE_ROOT}`);
await rm(SITE_ROOT, { recursive: true, force: true });
await mkdir(SITE_ROOT, { recursive: true });
for (const path of [...SITE_FILES, ...SITE_DIRECTORIES]) {
  const destination = resolve(SITE_ROOT, path);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await cp(resolve(ROOT, path), destination, { recursive: true, dereference: false });
}
console.log('Static site staged: dist/site/');

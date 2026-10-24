import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './config.js';

export async function listFiles(paths, root = ROOT) {
  const files = [];
  async function visit(path) {
    const info = await stat(resolve(root, path));
    if (info.isDirectory()) {
      for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
        if (entry.isSymbolicLink())
          throw new Error(`Symlinks are not supported: ${path}/${entry.name}`);
        await visit(`${path}/${entry.name}`);
      }
    } else if (info.isFile()) files.push(path);
  }
  for (const path of paths) await visit(path);
  return files.sort();
}

export function isMain(url) {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(url));
}

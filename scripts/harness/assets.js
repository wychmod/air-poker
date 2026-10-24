import { readFile, stat } from 'node:fs/promises';
import { extname, posix, resolve } from 'node:path';
import { inspectSource, walk } from './architecture.js';

export function resolveReference(from, reference) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) return null;
  const clean = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!clean) return null;
  if (clean.startsWith('/') || clean.includes('\\')) {
    throw new Error(`${from}: use a relative URL for subpath hosting: ${reference}`);
  }
  const target = posix.normalize(posix.join(posix.dirname(from), clean));
  if (target === '..' || target.startsWith('../')) {
    throw new Error(`${from}: reference escapes the site: ${reference}`);
  }
  return target;
}

export function referencesIn(file, source) {
  const references = [];
  const extension = extname(file);
  if (extension === '.html') {
    for (const match of source.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)) {
      references.push(match[1]);
    }
  } else if (extension === '.css') {
    for (const match of source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi)) {
      references.push(match[1] ?? match[2] ?? match[3]);
    }
    for (const match of source.matchAll(/@import\s+["']([^"']+)["']/gi)) references.push(match[1]);
  } else if (extension === '.js') {
    const { ast, imports } = inspectSource(source);
    for (const { specifier } of imports) {
      if (typeof specifier !== 'string')
        throw new Error(`${file}: computed import cannot be checked`);
      references.push(specifier);
    }
    walk(ast, (node) => {
      if (
        node.type === 'Literal' &&
        typeof node.value === 'string' &&
        /^(?:\.\.?\/|assets\/).+\.(?:png|jpe?g|svg|webp|avif|woff2?)(?:[?#].*)?$/i.test(node.value)
      )
        references.push(node.value);
    });
  }
  return [...new Set(references)];
}

export async function collectResources(siteRoot) {
  const queue = ['index.html'];
  const resources = new Map();
  for (const file of queue) {
    if (resources.has(file)) continue;
    const path = resolve(siteRoot, file);
    let info;
    try {
      info = await stat(path);
    } catch {
      throw new Error(`Missing staged resource: ${file}`);
    }
    if (!info.isFile()) throw new Error(`Expected a file: ${file}`);
    resources.set(file, info.size);
    if (!['.html', '.css', '.js'].includes(extname(file))) continue;
    for (const reference of referencesIn(file, await readFile(path, 'utf8'))) {
      const target = resolveReference(file, reference);
      if (target !== null) queue.push(target);
    }
  }
  return resources;
}

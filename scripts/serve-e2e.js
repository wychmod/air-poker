import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { MIME, SITE_ROOT } from './harness/config.js';

// Browser regression tests exercise only the built public artifact.
createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.startsWith('/air-poker/')) pathname = pathname.slice('/air-poker'.length);
    const destination = resolve(SITE_ROOT, pathname === '/' ? 'index.html' : pathname.slice(1));
    const inside = relative(SITE_ROOT, destination);
    if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('Outside site');
    const body = await readFile(destination);
    response
      .writeHead(200, {
        'Content-Type': MIME[extname(destination)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(4185, '127.0.0.1', () => console.log('Browser test site: http://127.0.0.1:4185'));

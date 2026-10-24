import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { collectResources } from './assets.js';
import { MIME, SITE_ROOT } from './config.js';

const resources = await collectResources(SITE_ROOT);
// Serve the actual artifact so accidental publication of private files is visible.
const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path.startsWith('/air-poker/')) path = path.slice('/air-poker'.length);
    const file = path === '/' ? 'index.html' : path.slice(1);
    const destination = resolve(SITE_ROOT, file);
    const inside = relative(SITE_ROOT, destination);
    if (inside.startsWith('..') || isAbsolute(inside)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(destination);
    response.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise((resolveListen, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListen);
});
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const prefix of ['/', '/air-poker/']) {
    for (const [file, size] of resources) {
      const response = await fetch(origin + prefix + (file === 'index.html' ? '' : file), {
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 200, `${prefix}${file}: HTTP status`);
      assert.equal(
        response.headers.get('content-type'),
        MIME[extname(file)] ?? 'application/octet-stream',
        `${prefix}${file}: MIME`,
      );
      assert.equal((await response.arrayBuffer()).byteLength, size, `${prefix}${file}: body size`);
    }
    for (const path of [
      'AGENTS.md',
      'doc/README.md',
      '.git/config',
      'scripts/serve.js',
      'package.json',
    ]) {
      const response = await fetch(origin + prefix + path, { signal: AbortSignal.timeout(5000) });
      await response.arrayBuffer();
      assert.equal(response.status, 404, `${prefix}${path}: private file`);
    }
  }
  console.log(`HTTP smoke OK: ${resources.size} local resources, / and /air-poker/, correct MIME.`);
  console.log('External URLs and browser interactions are not exercised by this check.');
} finally {
  await new Promise((close) => server.close(close));
}

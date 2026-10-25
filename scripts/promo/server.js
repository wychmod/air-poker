import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, sep, extname, relative as relativePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './common.js';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
};
export async function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const relative =
        pathname === '/' || pathname === '/promo/'
          ? 'promo/index.html'
          : pathname === '/promo/portrait/'
            ? 'promo/portrait/index.html'
            : pathname.slice(1);
      const file = resolve(ROOT, relative);
      const normalized = relativePath(ROOT, file).split(sep).join('/');
      const allowed =
        /^(promo\/(?!node_modules\/)|output\/promo\/|assets\/generated\/|game\/|ui\/|browser\/|styles\/)/.test(
          normalized,
        ) || ['index.html', 'app.js', 'i18n.js', 'styles.css'].includes(normalized);
      if (!allowed || !file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
        res.writeHead(404).end();
        return;
      }
      // HTML media seeking needs byte ranges; the ordinary document routes remain unchanged.
      if (['.mp4', '.m4a', '.wav'].includes(extname(file))) {
        const { size } = await stat(file);
        let start = 0,
          end = size - 1,
          partial = false;
        if (req.headers.range) {
          const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          if (!range || (!range[1] && !range[2])) {
            res.writeHead(416, { 'Content-Range': 'bytes */' + size }).end();
            return;
          }
          if (!range[1]) {
            const suffix = Number(range[2]);
            if (!Number.isSafeInteger(suffix) || suffix <= 0) {
              res.writeHead(416, { 'Content-Range': 'bytes */' + size }).end();
              return;
            }
            start = Math.max(0, size - suffix);
          } else {
            start = Number(range[1]);
            end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
          }
          if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start > end ||
            start >= size
          ) {
            res.writeHead(416, { 'Content-Range': 'bytes */' + size }).end();
            return;
          }
          partial = true;
        }
        const headers = {
          'Content-Type': types[extname(file)],
          'Accept-Ranges': 'bytes',
          'Content-Length': Math.max(0, end - start + 1),
          'Cache-Control': 'no-store',
        };
        if (partial) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
        res.writeHead(partial ? 206 : 200, headers);
        if (req.method === 'HEAD' || !size) {
          res.end();
          return;
        }
        const stream = createReadStream(file, { start, end });
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        stream.pipe(res);
        return;
      }
      const data = await readFile(file);
      res
        .writeHead(200, {
          'Content-Type': types[extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        .end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', ok);
  });
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    close: () => new Promise((ok) => server.close(ok)),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await startServer(Number(process.env.PROMO_PORT || 4180));
  console.log('Promo preview: ' + server.url + '/promo/');
}

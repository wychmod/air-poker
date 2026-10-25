import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
};
export async function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const relative =
        pathname === '/' || pathname === '/promo/' ? 'promo/index.html' : pathname.slice(1);
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

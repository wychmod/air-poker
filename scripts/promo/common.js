import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const OUT = resolve(ROOT, 'output/promo');
export const execute = promisify(execFile);
export const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
export async function browserEngine() {
  const require = createRequire(new URL('../../promo/package.json', import.meta.url));
  return require(process.env.PLAYWRIGHT_MODULE || 'playwright').chromium;
}
export function argsObject(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error('Expected --option, received ' + argv[i]);
    args[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || !argv[i + 1] ? true : argv[++i];
  }
  return args;
}
export function command(bin, args, { onLog } = {}) {
  return new Promise((resolvePromise, reject) => {
    const p = spawn(bin, args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '';
    p.stdout.on('data', (d) => {
      stdout += d;
    });
    p.stderr.on('data', (d) => {
      stderr += d;
      onLog?.(String(d));
    });
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0
        ? resolvePromise({ stdout, stderr })
        : reject(new Error(bin + ' failed (' + code + ')\n' + stderr.slice(-5000))),
    );
  });
}

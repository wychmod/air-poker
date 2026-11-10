import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'out/qa', process.argv[2] || 'v2');
await mkdir(out, { recursive: true });
const require = createRequire(resolve(root, 'package.json'));
const browserExecutable =
  process.env.REMOTION_BROWSER_EXECUTABLE || require('playwright').chromium.executablePath();
const serveUrl = await bundle({
  entryPoint: resolve(root, 'src/index.ts'),
  publicDir: resolve(root, 'public'),
});
const browser = await openBrowser('chrome', {
  browserExecutable,
  chromiumOptions: { gl: 'angle' },
});
try {
  const composition = await selectComposition({
    serveUrl,
    id: 'AirPokerPromo',
    inputProps: { bgm: true },
    puppeteerInstance: browser,
  });
  const frames = (
    process.argv[3] ||
    '12,55,75,112,158,220,250,280,320,342,395,432,486,548,582,610,660,695,720,750,780,840,870,899'
  )
    .split(',')
    .map(Number);
  for (const frame of frames) {
    await renderStill({
      serveUrl,
      composition,
      output: resolve(out, `f${String(frame).padStart(3, '0')}.png`),
      frame,
      imageFormat: 'png',
      puppeteerInstance: browser,
    });
    console.log(`Still ${frame}`);
  }
} finally {
  await browser.close({ silent: true });
}

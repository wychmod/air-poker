import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { ROOT } from './harness/config.js';
import { shareCoverSvg } from '../ui/share.js';

const output = resolve(ROOT, 'assets/share');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  for (const lang of ['zh', 'en']) {
    const svg = shareCoverSvg(lang);
    await writeFile(resolve(output, 'cover-' + lang + '.svg'), svg + '\n');
    await page.setContent(
      '<style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}</style>' + svg,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(output, 'cover-' + lang + '.png') });
  }
} finally {
  await browser.close();
}
console.log('Share covers generated: assets/share/cover-{zh,en}.{svg,png}');

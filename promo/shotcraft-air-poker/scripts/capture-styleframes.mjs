import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, '..', '..', 'output', 'shotcraft-promo', 'styleframes');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(resolve(root, 'styleframe.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const frames = await page.locator('.frame').count();
  for (let i = 0; i < frames; i++) {
    await page
      .locator('.frame')
      .nth(i)
      .screenshot({ path: resolve(out, `frame-0${i + 1}.png`) });
  }
} finally {
  await browser.close();
}

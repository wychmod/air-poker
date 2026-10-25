import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OUT, browserEngine } from './common.js';
export async function captureGame(url) {
  const browser = await (await browserEngine()).launch({ headless: true });
  const errors = [];
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    let seed = 73;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
  const dir = resolve(OUT, 'captures');
  await mkdir(dir, { recursive: true });
  const captured = [];
  const snap = async (name) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(dir, name + '.png'), animations: 'disabled' });
    captured.push(name);
  };
  try {
    await page.goto(url + '/index.html');
    await page.evaluate(() => document.fonts.ready);
    await snap('home');
    await page.locator('[data-action="enter-match"]').first().click();
    await page.locator('[data-action="skip-intro"]').click();
    for (let step = 0; step < 180; step++) {
      const visible = async (s) => page.locator(s).first().isVisible();
      if (await visible('[data-action="choose-target"]')) {
        await page.locator('[data-action="choose-target"]:not([disabled])').first().click();
        await page.locator('[data-action="confirm-target"]').click();
      } else if (await visible('[data-action="submit-hand"]')) {
        const candidate = page.locator('[data-action="select-candidate"]').first();
        if (await candidate.count()) {
          await candidate.click();
          if (!captured.includes('build')) await snap('build');
          await page.locator('[data-action="submit-hand"]').click();
        } else await page.locator('[data-action="fail-hand"]').click();
      } else if (await visible('[data-action="advance-round"]')) {
        if (!captured.includes('showdown')) await snap('showdown');
        await page.locator('[data-action="advance-round"]').click();
      } else if (await visible('[data-action="fast-forward"]')) {
        await page.locator('[data-action="fast-forward"]').click();
      } else if (await visible('.result-page')) {
        await snap('result');
        await page.locator('[data-action="open-record"]').first().click();
        await snap('review');
        break;
      } else {
        if (!captured.includes('bet') && (await visible('[data-action="bet"]'))) await snap('bet');
        const call = page.locator('[data-action="bet"][data-move="call"]:not([disabled])');
        const check = page.locator('[data-action="bet"][data-move="check"]:not([disabled])');
        if (await call.count()) await call.first().click();
        else if (await check.count()) await check.first().click();
        else await page.waitForTimeout(180);
      }
    }
    for (const name of ['build', 'showdown', 'review'])
      if (!captured.includes(name)) throw new Error('Missing game screenshot: ' + name);
    if (errors.length) throw new Error(errors.join('\n'));
    await writeFile(
      resolve(OUT, 'capture-manifest.json'),
      JSON.stringify(
        {
          captured,
          viewport: { width: 1440, height: 1080 },
          browser: browser.version(),
          method:
            'Actual app UI actions with fixed random seed 73; no injected game state; screenshots, not continuous gameplay video',
          errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

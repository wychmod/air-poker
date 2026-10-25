import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OUT, browserEngine } from './common.js';
export async function capturePortrait(url, lang = 'zh') {
  const browser = await (await browserEngine()).launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    let seed = 73;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
  const out = resolve(OUT, 'portrait', lang);
  const dir = resolve(out, 'captures');
  await mkdir(dir, { recursive: true });
  const captured = [];
  const snap = async (name) => {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(dir, name + '.png'), animations: 'disabled' });
    captured.push(name);
  };
  try {
    await page.goto(url + '/index.html');
    await page.locator('[data-lang="' + lang + '"]').click();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-action="enter-match"]').first().click();
    await page.locator('[data-action="skip-intro"]').click();
    for (let i = 0; i < 130; i++) {
      const visible = async (s) => page.locator(s).first().isVisible();
      if (await visible('[data-action="choose-target"]')) {
        await page.locator('[data-action="choose-target"]:not([disabled])').first().click();
        await page.locator('[data-action="confirm-target"]').click();
      } else if (await visible('[data-action="submit-hand"]')) {
        await page.locator('[data-action="select-candidate"]').first().click();
        if (!captured.includes('build')) await snap('build');
        await page.locator('[data-action="submit-hand"]').click();
      } else if (await visible('[data-action="advance-round"]')) {
        await snap('showdown');
        break;
      } else {
        const call = page.locator('[data-action="bet"][data-move="call"]:not([disabled])');
        const check = page.locator('[data-action="bet"][data-move="check"]:not([disabled])');
        if (await call.count()) await call.first().click();
        else if (await check.count()) await check.first().click();
        else await page.waitForTimeout(180);
      }
    }
    if (!captured.includes('build') || !captured.includes('showdown'))
      throw new Error('Mobile capture did not reach both scenes');
    if (errors.length) throw new Error(errors.join('\n'));
    await writeFile(
      resolve(out, 'capture-manifest.json'),
      JSON.stringify(
        {
          language: lang,
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 2,
          browser: browser.version(),
          captured,
          errors,
          method:
            'Actual production UI actions, seeded randomness 73, no injected game state. Still screenshots.',
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

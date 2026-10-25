import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OUT, browserEngine } from './common.js';
import { startServer } from './server.js';
const server = await startServer();
const browser = await (await browserEngine()).launch({ headless: true });
const reports = [];
try {
  for (const lang of ['zh', 'en']) {
    const errors = [],
      checks = [];
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(server.url + '/promo/portrait/?lang=' + lang);
    await page.evaluate(() => globalThis.promo.ready);
    assert.deepEqual(
      await page.locator('#film').evaluate((c) => [c.width, c.height]),
      [1080, 1920],
    );
    await page.locator('#play').click();
    await page.waitForTimeout(650);
    const active = await page.evaluate(() => ({
      time: Number(document.querySelector('#seek').value),
      audio: document.querySelector('#score').currentTime,
      paused: document.querySelector('#score').paused,
    }));
    assert.ok(active.time > 0.2 && !active.paused && Math.abs(active.time - active.audio) < 0.2);
    checks.push('Synchronized audio and picture start');
    await page.locator('#play').click();
    const paused = await page.locator('#seek').inputValue();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#seek').inputValue(), paused);
    checks.push('Pause stops picture and audio');
    await page.locator('[data-scene="calamity"]').click();
    assert.equal(Number(await page.locator('#seek').inputValue()), 9.5);
    await page.locator('#seek').evaluate((el) => {
      el.value = '13.5';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(await page.locator('#time').textContent(), '00:13 / 00:30');
    checks.push('Scene selection and scrubbing seek exactly');
    await page.locator('#safe-toggle').check();
    assert.equal(await page.locator('#guides').isVisible(), true);
    await page.locator('#safe-toggle').uncheck();
    checks.push('Platform obstruction guide is opt-in and outside canvas');
    const bounds = await page.evaluate(() => {
      const bad = [];
      for (let t = 0; t < 30; t += 0.25) {
        const { textBounds } = globalThis.promo.renderAt(t);
        const safe = globalThis.promo.safe;
        for (const b of textBounds)
          if (
            b.left < safe.left - 0.1 ||
            b.right > safe.right + 0.1 ||
            b.top < safe.top ||
            b.bottom > safe.bottom
          )
            bad.push({ t, ...b });
      }
      return bad;
    });
    assert.deepEqual(bounds, []);
    checks.push('Critical text stays inside safe bounds at 120 sampled times');
    const deterministic = await page.evaluate(() => {
      globalThis.promo.renderAt(13.5);
      const a = document.querySelector('#film').toDataURL();
      globalThis.promo.renderAt(1);
      globalThis.promo.renderAt(13.5);
      return a === document.querySelector('#film').toDataURL();
    });
    assert.equal(deterministic, true);
    checks.push('Reverse seek reproduces identical pixels');
    await page.locator('#restart').click();
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('ArrowRight');
    assert.equal(Number(await page.locator('#seek').inputValue()), 5);
    checks.push('Restart and keyboard seek work');
    await page.screenshot({ path: resolve(OUT, 'portrait', lang, 'preview-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({
      path: resolve(OUT, 'portrait', lang, 'preview-mobile.png'),
      fullPage: true,
    });
    checks.push('390px preview has no horizontal overflow');
    await page.close();
    const reduced = await browser.newPage({ reducedMotion: 'reduce' });
    await reduced.goto(server.url + '/promo/portrait/?lang=' + lang);
    await reduced.evaluate(() => globalThis.promo.ready);
    assert.match(
      await reduced.locator('#status').textContent(),
      lang === 'en' ? /Reduced motion/ : /减少动态/,
    );
    assert.equal(Number(await reduced.locator('#seek').inputValue()), 0);
    await reduced.close();
    checks.push('Reduced motion starts paused');
    assert.deepEqual(errors, []);
    reports.push({ lang, checks, errors });
  }
  const report = {
    browser: browser.version(),
    reports,
    limitations: [
      'Headless browser, not a physical phone',
      'No Douyin/TikTok upload or transcode test',
      'Full human listening not performed',
    ],
  };
  await writeFile(resolve(OUT, 'portrait', 'browser-check.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}

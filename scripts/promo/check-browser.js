import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OUT, browserEngine } from './common.js';
import { startServer } from './server.js';
const server = await startServer();
const browser = await (await browserEngine()).launch({ headless: true });
const errors = [],
  checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.url + '/promo/');
  await page.evaluate(() => globalThis.promo.ready);
  await page.locator('#play').click();
  await page.waitForTimeout(550);
  const active = await page.evaluate(() => ({
    time: Number(document.querySelector('#seek').value),
    audio: document.querySelector('#score').currentTime,
    paused: document.querySelector('#score').paused,
  }));
  assert.ok(active.time > 0.2 && !active.paused && Math.abs(active.time - active.audio) < 0.2);
  checks.push('Play starts synchronized audio and picture');
  await page.locator('#play').click();
  const before = await page.locator('#seek').inputValue();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#seek').inputValue(), before);
  checks.push('Pause freezes the picture');
  await page.locator('[data-scene="calamity"]').click();
  assert.equal(Number(await page.locator('#seek').inputValue()), 35.5);
  checks.push('Scene navigation seeks exactly');
  await page.locator('#seek').evaluate((el) => {
    el.value = '41';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.locator('#time').textContent(), '00:41 / 01:12');
  checks.push('Scrubbing updates picture and time');
  await page.locator('#restart').click();
  assert.equal(Number(await page.locator('#seek').inputValue()), 0);
  checks.push('Restart returns to the first frame');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('ArrowRight');
  assert.equal(Number(await page.locator('#seek').inputValue()), 5);
  checks.push('Keyboard seek works');
  const hash = await page.evaluate(() => {
    globalThis.promo.renderAt(40);
    return document.querySelector('#film').toDataURL();
  });
  await page.evaluate(() => globalThis.promo.renderAt(5));
  const again = await page.evaluate(() => {
    globalThis.promo.renderAt(40);
    return document.querySelector('#film').toDataURL();
  });
  assert.equal(hash, again);
  checks.push('Reverse seeking reproduces identical pixels');
  await page.screenshot({ path: resolve(OUT, 'preview-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: resolve(OUT, 'preview-mobile.png') });
  checks.push('390 px preview has no horizontal overflow');
  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.goto(server.url + '/promo/');
  await reduced.evaluate(() => globalThis.promo.ready);
  assert.match(await reduced.locator('#status').textContent(), /减少动态/);
  assert.equal(Number(await reduced.locator('#seek').inputValue()), 0);
  checks.push('Reduced-motion preview starts paused');
  assert.deepEqual(errors, []);
  const report = {
    browser: browser.version(),
    checks,
    errors,
    limitations: [
      'Headless browser, not a physical mobile device',
      'No Bilibili upload/transcode test',
      'Full continuous human listening not performed',
    ],
  };
  await writeFile(resolve(OUT, 'browser-check.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}

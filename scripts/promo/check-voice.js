import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OUT, browserEngine } from './common.js';
import { startServer } from './server.js';
const server = await startServer(),
  browser = await (await browserEngine()).launch({ headless: true });
const checks = [],
  errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(server.url + '/promo/portrait/audio-compare.html');
  await page.waitForFunction(() =>
    document.querySelector('#compare-status').textContent.includes('已匹配'),
  );
  const initial = await page.locator('video').evaluate((v) => ({
    duration: v.duration,
    width: v.videoWidth,
    height: v.videoHeight,
    paused: v.paused,
    error: v.error?.code,
  }));
  assert.equal(initial.duration, 30);
  assert.equal(initial.width, 1080);
  assert.equal(initial.height, 1920);
  assert.equal(initial.paused, true);
  assert.equal(initial.error, undefined);
  checks.push('V2 video and AAC load at 1080×1920 / 30 seconds, starts paused');
  await page.locator('video').evaluate((v) => {
    v.currentTime = 12.7;
  });
  await page.locator('[data-version="v1"]').click();
  await page.waitForFunction(() =>
    document.querySelector('#compare-status').textContent.startsWith('V1 音乐字幕版 ·'),
  );
  const old = await page
    .locator('video')
    .evaluate((v) => ({ time: v.currentTime, volume: v.volume }));
  assert.ok(Math.abs(old.time - 12.7) < 0.08);
  assert.ok(old.volume > 0.92 && old.volume < 0.94);
  checks.push('Switch preserves frame position and matches measured loudness');
  await page.locator('#match-level').uncheck();
  assert.equal(await page.locator('video').evaluate((v) => v.volume), 1);
  await page.locator('[data-version="v2"]').click();
  await page.waitForFunction(() =>
    document.querySelector('#compare-status').textContent.startsWith('V2 中文旁白版 ·'),
  );
  await page.locator('video').evaluate((v) => v.play());
  await page.waitForTimeout(650);
  const playing = await page
    .locator('video')
    .evaluate((v) => ({ time: v.currentTime, paused: v.paused, error: v.error?.code }));
  assert.ok(playing.time > 13 && !playing.paused && !playing.error);
  await page.locator('video').evaluate((v) => v.pause());
  checks.push('Native browser decodes and plays V2 with sound enabled');
  assert.equal(await page.locator('#voice-transcript li').count(), 9);
  checks.push('Nine timed narration lines are available');
  await page.screenshot({ path: resolve(OUT, 'voice-v2', 'comparison-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({
    path: resolve(OUT, 'voice-v2', 'comparison-mobile.png'),
    fullPage: true,
  });
  checks.push('390px comparison has no horizontal overflow');
  const audio = await page.request.get(
    server.url + '/promo/releases/portrait-v2/zh/voice-v2-preview.m4a',
  );
  assert.equal(audio.status(), 200);
  assert.match(audio.headers()['content-type'], /audio\/mp4/);
  checks.push('Standalone audio has correct MIME type');
  assert.deepEqual(errors, []);
  const report = {
    browser: browser.version(),
    checks,
    errors,
    limitations: [
      'Headless decoding does not assess voice acting or human listening quality',
      'No physical phone speaker or platform transcode test',
    ],
  };
  await writeFile(
    resolve(OUT, 'voice-v2', 'browser-check.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}

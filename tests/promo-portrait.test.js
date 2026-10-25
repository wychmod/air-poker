import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENES,
  DURATION,
  FPS,
  SAFE,
  getCaptions,
  sceneAt,
  toSrt,
} from '../promo/portrait/timeline.js';
import { getComposition, frameSettings } from '../scripts/promo/compositions.js';
import { startServer } from '../scripts/promo/server.js';
test('portrait timelines cover all 900 frames in both languages with no subtitle gaps', () => {
  assert.equal(DURATION * FPS, 900);
  let previous = 0;
  for (const s of SCENES) {
    assert.equal(s.start, previous);
    assert.ok(s.end > s.start);
    previous = s.end;
  }
  assert.equal(previous, DURATION);
  for (const lang of ['zh', 'en']) {
    let end = 0;
    for (const [a, b, copy] of getCaptions(lang)) {
      assert.equal(a, end);
      assert.ok(b > a && copy.length > 0);
      end = b;
    }
    assert.equal(end, DURATION);
  }
  for (let f = 0; f < 900; f++) {
    const t = f / FPS,
      s = sceneAt(t);
    assert.ok(t >= s.start && t < s.end);
    assert.equal(getCaptions('en').filter(([a, b]) => t >= a && t < b).length, 1);
  }
  assert.equal(sceneAt(12.5).id, 'calamity');
  assert.equal(sceneAt(15.5).id, 'twist');
  assert.ok(SAFE.right < 1080 && SAFE.bottom < 1920);
  assert.match(toSrt(12, 14, 'en'), /00:00:00,000 --> 00:00:00,500/);
  assert.match(toSrt(12, 14, 'en'), /00:00:00,500 --> 00:00:02,000/);
  assert.ok(!toSrt(12, 14, 'en').includes('Your next breath'));
});
test('composition selection isolates outputs and rejects impossible encoding geometry', () => {
  const zh = getComposition('portrait', 'zh'),
    en = getComposition('portrait', 'en'),
    wide = getComposition();
  assert.notEqual(zh.out, en.out);
  assert.notEqual(zh.out, wide.out);
  assert.deepEqual(frameSettings(zh), {
    start: 0,
    end: 30,
    fps: 30,
    width: 1080,
    height: 1920,
    frames: 900,
    duration: 30,
  });
  assert.equal(frameSettings(wide).height, 1080);
  assert.equal(frameSettings(wide).frames, 2160);
  assert.equal(frameSettings(en, { width: 360 }).height, 640);
  assert.equal(frameSettings(en, { start: 12.5, end: 15.5 }).frames, 90);
  for (const args of [{ start: -1 }, { end: 31 }, { width: 1000 }, { fps: 14 }, { end: 1.01 }])
    assert.throws(() => frameSettings(en, args));
  assert.throws(() => getComposition('square'));
  assert.throws(() => getComposition('landscape', 'en'));
  assert.throws(() => getCaptions('fr'));
});
test('portrait preview alias and files are available through the limited production server', async () => {
  const server = await startServer();
  try {
    for (const path of [
      '/promo/portrait/',
      '/promo/portrait/film.js',
      '/promo/portrait/timeline.js',
    ])
      assert.equal((await fetch(server.url + path)).status, 200);
    assert.equal((await fetch(server.url + '/promo/..%2fpackage.json')).status, 404);
  } finally {
    await server.close();
  }
});

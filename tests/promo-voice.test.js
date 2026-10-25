import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICE_CUES, fitVoice } from '../scripts/promo/voice-timeline.js';
import { speechExtent, encodeWave, AUDIO_RATE } from '../scripts/promo/wave.js';
test('speech cannot overrun a scene or be accelerated beyond the intelligibility limit', () => {
  let end = 0;
  for (const cue of VOICE_CUES) {
    assert.ok(cue.start >= end && cue.end <= 30);
    const fit = fitVoice(cue.end - cue.start, cue);
    assert.ok(fit.end <= cue.end + 0.00001);
    end = cue.end;
  }
  const cue = { id: 'example', start: 2, end: 5 };
  assert.equal(fitVoice(2, cue).end, 4);
  assert.ok(Math.abs(fitVoice(3.3, cue).speed - 1.1) < 1e-12);
  assert.throws(() => fitVoice(4, cue), /shorten/);
  assert.throws(() => fitVoice(0, cue));
});
test('edge silence trimming preserves an intentional pause between spoken phrases', () => {
  const samples = new Float32Array(AUDIO_RATE * 3);
  samples.fill(0.1, AUDIO_RATE * 0.3, AUDIO_RATE * 0.7);
  samples.fill(0.1, AUDIO_RATE * 1.8, AUDIO_RATE * 2.3);
  const extent = speechExtent(samples);
  assert.ok(extent.start < 0.3 && extent.start > 0.2);
  assert.ok(extent.end > 2.3 && extent.end < 2.5);
  assert.ok(extent.end - extent.start > 2);
  assert.throws(() => speechExtent(new Float32Array(AUDIO_RATE)), /silent/);
  assert.throws(() => encodeWave([Float32Array.of(1.1)]), /clip/);
  assert.throws(() => encodeWave([Float32Array.of(NaN)]), /non-finite/);
});

test('media byte ranges preserve exact bytes and allow browser seeking without full downloads', async () => {
  const { mkdir, writeFile, unlink } = await import('node:fs/promises');
  const { randomUUID } = await import('node:crypto');
  const { resolve } = await import('node:path');
  const { OUT } = await import('../scripts/promo/common.js');
  const { startServer } = await import('../scripts/promo/server.js');
  await mkdir(OUT, { recursive: true });
  const name = 'range-test-' + randomUUID() + '.wav',
    file = resolve(OUT, name),
    data = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  await writeFile(file, data);
  const server = await startServer();
  const url = server.url + '/output/promo/' + name;
  try {
    const part = await fetch(url, { headers: { Range: 'bytes=10-29' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 10-29/256');
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), data.subarray(10, 30));
    const suffix = await fetch(url, { headers: { Range: 'bytes=-8' } });
    assert.equal(suffix.status, 206);
    assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), data.subarray(248));
    const head = await fetch(url, { method: 'HEAD', headers: { Range: 'bytes=20-' } });
    assert.equal(head.status, 206);
    assert.equal(head.headers.get('content-length'), '236');
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    const bad = await fetch(url, { headers: { Range: 'bytes=300-' } });
    assert.equal(bad.status, 416);
    assert.equal(bad.headers.get('content-range'), 'bytes */256');
  } finally {
    await server.close();
    await unlink(file);
  }
});

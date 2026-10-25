import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import assert from 'node:assert/strict';
import { argsObject, OUT, ffmpeg, command } from './common.js';
const args = argsObject();
const name = String(args.name || 'air-poker-bilibili-72s');
if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid filename');
const file = resolve(OUT, name + '.mp4');
const manifest = JSON.parse(await readFile(resolve(OUT, name + '.render.json'), 'utf8'));
const decode = await command(ffmpeg, [
  '-hide_banner',
  '-v',
  'info',
  '-i',
  file,
  '-map',
  '0:v:0',
  '-map',
  '0:a:0',
  '-f',
  'null',
  '-',
]);
assert.match(decode.stderr, /Video: h264/);
assert.match(decode.stderr, /yuv420p/);
assert.match(decode.stderr, /Audio: aac/);
assert.match(decode.stderr, /48000 Hz, stereo/);
assert.ok(decode.stderr.includes(manifest.width + 'x' + manifest.height));
const total = [...decode.stderr.matchAll(/frame=\s*(\d+)/g)].at(-1);
assert.ok(total, 'Frame count missing');
assert.equal(Number(total[1]), manifest.frames);
const duration = decode.stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
assert.ok(duration);
const seconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
assert.ok(Math.abs(seconds - manifest.duration) < 0.08, 'Duration mismatch');
const analysis = await command(ffmpeg, [
  '-hide_banner',
  '-i',
  file,
  '-vn',
  '-af',
  'loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json',
  '-f',
  'null',
  '-',
]);
const loudness = JSON.parse([...analysis.stderr.matchAll(/\{[^{}]*"input_i"[^{}]*\}/gs)].at(-1)[0]);
assert.ok(Math.abs(Number(loudness.input_i) + 14) < 1, 'Loudness is outside production target');
assert.ok(Number(loudness.input_tp) <= -1, 'True peak is above delivery ceiling');
const report = {
  file: basename(file),
  fullDecode: true,
  frames: Number(total[1]),
  duration: seconds,
  width: manifest.width,
  height: manifest.height,
  fps: manifest.fps,
  audio: 'AAC 48 kHz stereo',
  loudness,
  checkedAt: new Date().toISOString(),
};
await writeFile(resolve(OUT, name + '.verified.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

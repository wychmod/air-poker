import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OUT } from './common.js';
import { DURATION, BPM, SCENES } from '../../promo/portrait/timeline.js';
const RATE = 48000;
export async function makePortraitAudio(lang = 'zh') {
  const n = RATE * DURATION,
    left = new Float32Array(n),
    right = new Float32Array(n);
  let seed = 10252026,
    noiseState = 0;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    noiseState += 0.45 * (seed / 2147483648 - 1 - noiseState);
    return noiseState;
  };
  const note = (m) => 440 * 2 ** ((m - 69) / 12);
  function add(at, len, fn, pan = 0) {
    const from = Math.round(at * RATE),
      count = Math.min(Math.round(len * RATE), n - from);
    const l = Math.sqrt((1 - pan) / 2),
      r = Math.sqrt((1 + pan) / 2);
    for (let i = 0; i < count; i++) {
      const v = fn(i / RATE);
      left[from + i] += v * l;
      right[from + i] += v * r;
    }
  }
  function kick(at, gain = 0.4) {
    add(
      at,
      0.5,
      (t) =>
        (Math.sin(2 * Math.PI * (48 * t + 7 * (1 - Math.exp(-28 * t)))) +
          0.2 * Math.sin(2 * Math.PI * 96 * t)) *
        Math.exp(-t * 9) *
        gain,
    );
  }
  for (let k = 0; k < (DURATION * BPM) / 60; k++) {
    const t = (k * 60) / BPM;
    if (t < 2.5 || t >= 25.5 || (t >= 15.5 && t < 16.3)) continue;
    if (k % 2 === 0) kick(t, 0.4);
    if (k % 4 === 2)
      add(
        t,
        0.23,
        (s) =>
          (noise() * 0.16 + Math.sin(2 * Math.PI * 185 * s) * 0.06) *
          Math.min(1, s * 350) *
          Math.exp(-s * 21),
      );
    add(
      t,
      0.075,
      (s) => noise() * 0.09 * Math.min(1, s * 500) * Math.exp(-s * 50),
      ((k % 3) - 1) * 0.35,
    );
    if (k % 2 === 0) {
      const bass = [38, 38, 34, 41][Math.floor(k / 8) % 4];
      add(
        t,
        0.7,
        (s) =>
          (Math.sin(2 * Math.PI * note(bass) * s) + 0.18 * Math.sin(4 * Math.PI * note(bass) * s)) *
          0.16 *
          Math.min(1, s * 70) *
          Math.exp(-s * 4),
      );
    }
    if (k % 2 === 0) {
      const m = [62, 65, 64, 69][Math.floor(k / 2) % 4];
      add(
        t,
        1.1,
        (s) =>
          (Math.sin(2 * Math.PI * note(m) * s) + 0.13 * Math.sin(2 * Math.PI * note(m) * 3 * s)) *
          0.055 *
          Math.min(1, s * 150) *
          Math.exp(-s * 4),
        k % 4 ? 0.3 : -0.3,
      );
    }
  }
  for (const t of [0, 0.28, 2.5, 5.5, 9.5, 12.5, 18, 22, 25.5]) {
    kick(t, 0.5);
    add(
      t,
      1.25,
      (s) => Math.sin(2 * Math.PI * 36 * s) * 0.19 * Math.exp(-s * 3) * Math.min(1, s * 100),
    );
  }
  for (const t of [5.7, 5.86, 6.02, 6.18, 6.34, 22, 23.75])
    add(t, 0.15, (s) => noise() * 0.16 * Math.min(1, s * 500) * Math.exp(-s * 28));
  for (const scene of SCENES.slice(1))
    add(scene.start - 0.18, 0.3, (s) => noise() * 0.08 * Math.sin((Math.PI * s) / 0.3) ** 3, -0.3);
  for (let t = 0; t < 30; t += 3) {
    [50, 53, 57].forEach((m, j) =>
      add(
        t,
        4,
        (s) =>
          Math.sin(2 * Math.PI * note(m) * s + 0.07 * Math.sin(s * 3)) *
          0.022 *
          Math.sin((Math.PI * s) / 4) ** 2,
        (j - 1) * 0.35,
      ),
    );
  }
  add(0, DURATION, (t) => noise() * 0.022 * (0.4 + 0.6 * Math.sin(t * 0.8) ** 4));
  // Saturation followed by a gentle low-pass preserves impact without needle-like noise peaks.
  const bytes = Buffer.alloc(44 + n * 4);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(RATE, 24);
  bytes.writeUInt32LE(RATE * 4, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(n * 4, 40);
  let l = 0,
    r = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE,
      fade = Math.min(1, t / 0.012, (DURATION - t) / 0.7),
      space = t >= 15.5 && t < 16.3 ? 0.23 : 1;
    l += 0.55 * (Math.tanh(left[i] * 4.5) * 0.7 - l);
    r += 0.55 * (Math.tanh(right[i] * 4.5) * 0.7 - r);
    bytes.writeInt16LE(Math.round(l * fade * space * 32767), 44 + i * 4);
    bytes.writeInt16LE(Math.round(r * fade * space * 32767), 46 + i * 4);
  }
  const dir = resolve(OUT, 'portrait', lang);
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, 'score.wav');
  await writeFile(file, bytes);
  return file;
}

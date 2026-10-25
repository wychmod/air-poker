import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DURATION, BPM } from '../../promo/timeline.js';
import { OUT } from './common.js';
export const RATE = 48000;
export async function makeAudio() {
  const count = RATE * DURATION;
  const left = new Float32Array(count),
    right = new Float32Array(count);
  let seed = 20261025;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  function add(start, duration, fn, pan = 0) {
    const from = Math.max(0, Math.round(start * RATE)),
      n = Math.min(Math.round(duration * RATE), count - from);
    const l = Math.sqrt((1 - pan) * 0.5),
      r = Math.sqrt((1 + pan) * 0.5);
    for (let i = 0; i < n; i++) {
      const t = i / RATE,
        v = fn(t, i);
      left[from + i] += v * l;
      right[from + i] += v * r;
    }
  }
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);
  const beat = 60 / BPM;
  // A composed four-note motif: D, F, E, A. Its sparse opening returns at the close.
  for (let t = 0; t < DURATION; t += beat) {
    const i = Math.round(t / beat),
      bar = Math.floor(i / 8),
      note = [38, 41, 36, 33][bar % 4];
    const active = (t >= 16 && t < 44) || (t >= 49 && t < 62);
    if (t < 4 || (t >= 44 && t < 46) || t >= 69) continue;
    if (i % (active ? 2 : 4) === 0)
      add(
        t,
        0.55,
        (s) =>
          Math.sin(2 * Math.PI * (43 * s + 8 * (1 - Math.exp(-28 * s)))) * Math.exp(-s * 10) * 0.5,
      );
    if (active && i % 4 === 2)
      add(
        t,
        0.22,
        (s) => (noise() * 0.12 + Math.sin(2 * Math.PI * 160 * s) * 0.12) * Math.exp(-s * 20),
        0.1,
      );
    if (active) {
      add(t, 0.07, (s) => noise() * Math.exp(-s * 65) * 0.065, ((i % 3) - 1) * 0.4);
    }
    if (i % 2 === 0)
      add(
        t,
        0.8,
        (s) =>
          (Math.sin(2 * Math.PI * midi(note) * s) +
            0.19 * Math.sin(2 * Math.PI * midi(note) * 2 * s)) *
          Math.exp(-s * 3) *
          Math.min(1, s * 65) *
          0.14,
      );
    if (i % 2 === 0 && t >= 10) {
      const key = [62, 65, 64, 69][Math.floor(i / 2) % 4];
      add(
        t,
        1.7,
        (s) =>
          Math.sin(2 * Math.PI * midi(key) * s) * Math.exp(-s * 3.4) * Math.min(1, s * 100) * 0.065,
        i % 4 === 0 ? -0.35 : 0.35,
      );
    }
  }
  for (let start = 4; start < 68; start += 4) {
    const notes = [50, 53, 57, 62];
    notes.forEach((note, j) =>
      add(
        start,
        5,
        (s) =>
          Math.sin(2 * Math.PI * midi(note) * s + 0.1 * Math.sin(s * 2)) *
          Math.sin(Math.PI * Math.min(s / 5, 1)) ** 2 *
          0.026,
        (j - 1.5) / 3,
      ),
    );
  }
  // Band-limited water hiss, not a recording of a real person.
  let filtered = 0;
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    filtered = filtered * 0.96 + noise() * 0.04;
    const swell = (0.3 + 0.7 * Math.sin(t * 0.8) ** 4) * 0.1;
    left[i] += filtered * swell;
    right[i] += filtered * swell * 0.92;
  }
  const impact = (t, gain = 0.5) =>
    add(
      t,
      1.8,
      (s) =>
        (Math.sin(2 * Math.PI * (38 * s + 5 * (1 - Math.exp(-20 * s)))) * Math.exp(-s * 3) +
          noise() * 0.2 * Math.exp(-s * 16)) *
        gain,
    );
  [0, 0.28, 2, 35, 38.5, 41, 49, 62, 66].forEach((t) => impact(t, t === 38.5 ? 0.65 : 0.4));
  // Paper flicks align with five cards and with three real-interface cuts.
  [10.2, 10.4, 10.6, 10.8, 11, 16.2, 16.4, 16.6, 16.8, 17, 23.5, 30, 31, 32, 56, 58, 60].forEach(
    (t) => add(t, 0.16, (s) => noise() * Math.exp(-s * 35) * 0.17),
  );
  [4, 10, 16, 23, 28, 35, 49, 56, 62, 66].forEach((t) =>
    add(
      Math.max(0, t - 0.28),
      0.48,
      (s) => noise() * Math.sin((Math.PI * s) / 0.48) ** 3 * 0.07,
      -0.25,
    ),
  );
  // Deliberate negative space for the reversal; preserve a little water tone.
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    const mute = t >= 44 && t < 46 ? 0.14 : 1;
    const fade = Math.min(1, t / 0.04, (DURATION - t) / 1.2);
    left[i] *= mute * fade;
    right[i] *= mute * fade;
  }
  let peak = 0;
  for (let i = 0; i < count; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const scale = 0.88 / Math.max(peak, 0.88);
  const buffer = Buffer.alloc(44 + count * 4);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(count * 4, 40);
  // Soft saturation reduces isolated impact peaks while preserving the quiet reversal.
  for (let i = 0; i < count; i++) {
    buffer.writeInt16LE(Math.round(Math.tanh(left[i] * scale * 4.5) * 0.7 * 32767), 44 + i * 4);
    buffer.writeInt16LE(Math.round(Math.tanh(right[i] * scale * 4.5) * 0.7 * 32767), 46 + i * 4);
  }
  const path = resolve(OUT, 'score.wav');
  await writeFile(path, buffer);
  return path;
}

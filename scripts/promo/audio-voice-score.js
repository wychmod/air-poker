import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OUT } from './common.js';
import { AUDIO_RATE as RATE, writeWave } from './wave.js';
const DURATION = 30,
  BPM = 120,
  TAU = Math.PI * 2;
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const p = clamp(x);
  return p * p * (3 - 2 * p);
};
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
function noiseSource(seed) {
  let low = 0,
    slow = 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1;
    low += 0.16 * (white - low);
    slow += 0.018 * (white - slow);
    return { low, band: low - slow, high: white - low };
  };
}
export async function makeVoiceScore() {
  const frames = RATE * DURATION;
  const buses = {
    music: [new Float32Array(frames), new Float32Array(frames)],
    fx: [new Float32Array(frames), new Float32Array(frames)],
  };
  const events = [];
  function add(bus, at, duration, fn, pan = 0, label) {
    const from = Math.round(at * RATE),
      n = Math.min(Math.round(duration * RATE), frames - from),
      left = Math.sqrt((1 - pan) / 2),
      right = Math.sqrt((1 + pan) / 2);
    for (let i = 0; i < n; i++) {
      const value = fn(i / RATE);
      if (from + i >= 0) {
        buses[bus][0][from + i] += value * left;
        buses[bus][1][from + i] += value * right;
      }
    }
    if (label) events.push({ bus, at, duration, label });
  }
  function kick(at, gain = 0.22) {
    add(
      'music',
      at,
      0.42,
      (t) => {
        const phase = TAU * (49 * t + 5.5 * (1 - Math.exp(-30 * t)));
        return (
          gain *
          (Math.sin(phase) + 0.16 * Math.sin(phase * 2)) *
          Math.exp(-t * 10) *
          smooth(t / 0.009)
        );
      },
      0,
      'muted low drum',
    );
  }
  function bass(at, m, duration = 0.43, gain = 0.11) {
    const f = hz(m);
    add(
      'music',
      at,
      duration,
      (t) =>
        (Math.sin(TAU * f * t) +
          0.32 * Math.sin(TAU * f * 2 * t) +
          0.13 * Math.sin(TAU * f * 3 * t)) *
        gain *
        smooth(t / 0.025) *
        smooth((duration - t) / 0.12),
    );
  }
  function mallet(at, m, gain = 0.08, pan = 0) {
    const f = hz(m);
    add(
      'music',
      at,
      1.6,
      (t) =>
        (Math.sin(TAU * f * t + 0.22 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 10)) +
          0.2 * Math.sin(TAU * f * 3.01 * t) * Math.exp(-t * 9)) *
        gain *
        Math.exp(-t * 3.6) *
        smooth(t / 0.009),
      pan,
      'glass motif',
    );
    add(
      'music',
      at + 0.19,
      1.4,
      (t) => Math.sin(TAU * f * t) * gain * 0.17 * Math.exp(-t * 4) * smooth(t / 0.025),
      -pan,
    );
  }
  // Slow harmonic movement, unlike the single repeated chord of the music-only edit.
  const chords = [
    { at: 0, len: 5.9, notes: [50, 53, 57, 64] },
    { at: 5.5, len: 4.4, notes: [46, 53, 57, 62] },
    { at: 9.5, len: 6.3, notes: [45, 52, 55, 58] },
    { at: 17.3, len: 5.1, notes: [48, 55, 62, 64] },
    { at: 22, len: 3.9, notes: [46, 53, 57, 62] },
    { at: 25.5, len: 4.5, notes: [50, 53, 57, 64] },
  ];
  for (const chord of chords)
    chord.notes.forEach((m, i) => {
      const f = hz(m) * (1 + (i - 1.5) * 0.0007),
        pan = (i - 1.5) * 0.35;
      add(
        'music',
        chord.at,
        chord.len,
        (t) => {
          const env = smooth(t / 0.5) * smooth((chord.len - t) / 0.65);
          return (
            0.027 *
            env *
            (Math.sin(TAU * f * t + 0.09 * Math.sin(TAU * 0.31 * t)) +
              0.21 * Math.sin(TAU * f * 2 * t) +
              0.075 * Math.sin(TAU * f * 3 * t))
          );
        },
        pan,
        'suspended string pad',
      );
    });
  for (let t = 2.5, k = 0; t < 25.5; t += 0.5, k++) {
    if (t >= 15.5 && t < 18) continue;
    if (k % 2 === 0 || (t >= 18 && k % 8 === 7)) kick(t, t >= 18 ? 0.25 : 0.18);
    const m = t < 5.5 ? 38 : t < 9.5 ? 34 : t < 15.5 ? 33 : t < 22 ? 36 : 34;
    if (k % 2 === 0) bass(t, m, 0.43, t >= 18 ? 0.13 : 0.09);
    if (k % 2 === 1) {
      const noise = noiseSource(900 + k);
      add(
        'music',
        t,
        0.16,
        (s) =>
          (noise().band * 0.18 + Math.sin(TAU * 174 * s) * 0.017) *
          Math.exp(-s * 29) *
          smooth(s / 0.006),
        k % 4 ? 0.18 : -0.18,
      );
    }
    if ((t >= 9.5 && t < 15.5) || t >= 18) {
      const noise = noiseSource(1200 + k);
      add(
        'music',
        t + 0.25,
        0.08,
        (s) => noise().high * 0.025 * Math.exp(-s * 55) * smooth(s / 0.005),
        k % 2 ? 0.4 : -0.4,
      );
    }
  }
  [
    [0.4, 62],
    [1.6, 69],
    [4.85, 65],
    [8.8, 64],
    [11.95, 61],
    [14.9, 58],
    [17.55, 69],
    [21.6, 67],
    [25.55, 62],
    [26.05, 65],
    [27.0, 69],
    [28.4, 74],
  ].forEach(([t, m], i) => mallet(t, m, t >= 25.5 ? 0.085 : 0.045, i % 2 ? 0.35 : -0.35));
  function impact(at, gain = 0.2) {
    const noise = noiseSource(Math.round(at * 1000) + 33);
    add(
      'fx',
      at,
      1.2,
      (t) =>
        (Math.sin(TAU * (44 * t + 2 * (1 - Math.exp(-t * 18)))) * 0.8 + noise().band * 0.9) *
        gain *
        Math.exp(-t * 5) *
        smooth(t / 0.007),
      0,
      'low impact',
    );
  }
  function air(at, duration, gain, pan = 0) {
    const noise = noiseSource(Math.round(at * 310) + 91);
    add(
      'fx',
      at,
      duration,
      (t) => noise().band * gain * Math.sin((Math.PI * t) / duration) ** 1.6,
      pan,
      'air valve',
    );
  }
  // Sound effects have distinct timbres and narrative functions, not a hit at every cut.
  impact(0.02, 0.25);
  impact(0.3, 0.12);
  air(0.45, 1.15, 0.12, -0.1);
  air(2.48, 0.55, 0.28, 0.15);
  for (let i = 0; i < 5; i++) {
    const noise = noiseSource(81 + i);
    add(
      'fx',
      5.68 + i * 0.14,
      0.16,
      (t) =>
        (noise().high * 0.1 + Math.sin(TAU * (420 - 50 * i) * t) * 0.045) *
        Math.exp(-t * 36) *
        smooth(t / 0.003),
      (i - 2) * 0.12,
      'paper card',
    );
  }
  impact(9.5, 0.27);
  air(9.25, 0.28, 0.24, -0.4);
  impact(12.5, 0.34);
  air(12.52, 0.9, 0.43, 0.2);
  add(
    'fx',
    12.5,
    0.55,
    (t) => Math.sin(TAU * (195 * t - 95 * t * t)) * 0.055 * Math.exp(-t * 6) * smooth(t / 0.008),
    -0.1,
    'air loss descent',
  );
  air(15.65, 1.25, 0.17, 0);
  impact(18, 0.2);
  air(17.75, 0.28, 0.21, -0.3);
  for (const t of [22, 23.75]) {
    const noise = noiseSource(982 + Math.round(t * 100));
    add(
      'fx',
      t,
      0.085,
      (s) =>
        (Math.sin(TAU * 900 * s) * 0.045 + noise().band * 0.12) *
        Math.exp(-s * 58) *
        smooth(s / 0.003),
      0,
      'UI tap',
    );
  }
  impact(25.5, 0.22);
  air(28.9, 0.85, 0.12, 0.12);
  const bed = noiseSource(410);
  add(
    'music',
    0,
    DURATION,
    (t) => bed().low * 0.027 * (0.6 + 0.4 * Math.sin(t * 0.7) ** 2),
    0,
    'underwater texture',
  );
  for (let i = 0; i < frames; i++) {
    const t = i / RATE,
      endFade = smooth((30 - t) / 0.8),
      startFade = smooth(t / 0.015);
    const gap = 1 - 0.87 * smooth((t - 15.4) / 0.1) * (1 - smooth((t - 17.1) / 0.5));
    for (const ch of buses.music) ch[i] *= gap * endFade * startFade;
    for (const ch of buses.fx) ch[i] *= endFade * startFade;
  }
  const dir = resolve(OUT, 'voice-v2');
  await mkdir(dir, { recursive: true });
  for (const [name, channels] of Object.entries(buses))
    await writeWave(resolve(dir, name + '.wav'), channels);
  await writeFile(
    resolve(dir, 'score-events.json'),
    JSON.stringify({ bpm: BPM, duration: DURATION, events }, null, 2) + '\n',
  );
  return { music: resolve(dir, 'music.wav'), fx: resolve(dir, 'fx.wav') };
}

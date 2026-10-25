import { readFile, writeFile } from 'node:fs/promises';
export const AUDIO_RATE = 48000;
export function encodeWave(channels, rate = AUDIO_RATE) {
  const frames = channels[0].length,
    count = channels.length;
  if (!channels.every((c) => c.length === frames) || ![1, 2].includes(count))
    throw new Error('Invalid PCM channels');
  const buffer = Buffer.alloc(44 + frames * count * 2);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(count, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * count * 2, 28);
  buffer.writeUInt16LE(count * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * count * 2, 40);
  for (let i = 0; i < frames; i++)
    for (let channel = 0; channel < count; channel++) {
      const sample = channels[channel][i];
      if (!Number.isFinite(sample) || Math.abs(sample) > 1)
        throw new Error('PCM clip or non-finite sample');
      buffer.writeInt16LE(Math.round(sample * 32767), 44 + (i * count + channel) * 2);
    }
  return buffer;
}
export async function writeWave(path, channels, rate = AUDIO_RATE) {
  await writeFile(path, encodeWave(channels, rate));
}
export async function readWave(path) {
  const buffer = await readFile(path);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('Expected RIFF WAVE');
  let format, data;
  for (let p = 12; p + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', p, p + 4),
      size = buffer.readUInt32LE(p + 4),
      start = p + 8;
    if (start + size > buffer.length) throw new Error('Truncated wave');
    if (id === 'fmt ')
      format = {
        type: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        rate: buffer.readUInt32LE(start + 4),
        bits: buffer.readUInt16LE(start + 14),
      };
    if (id === 'data') data = buffer.subarray(start, start + size);
    p = start + size + (size % 2);
  }
  if (
    !format ||
    !data ||
    format.type !== 1 ||
    format.bits !== 16 ||
    ![1, 2].includes(format.channels)
  )
    throw new Error('Expected 16-bit PCM');
  const frames = data.length / (format.channels * 2);
  if (!Number.isInteger(frames)) throw new Error('Partial PCM frame');
  const channels = Array.from({ length: format.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++)
    for (let ch = 0; ch < format.channels; ch++)
      channels[ch][i] = data.readInt16LE((i * format.channels + ch) * 2) / 32768;
  return { ...format, frames, duration: frames / format.rate, samples: channels };
}
// Only trim the edges. Punctuation pauses inside a sentence are retained.
export function speechExtent(samples, rate = AUDIO_RATE) {
  const window = Math.round(rate * 0.01);
  let first = -1,
    last = -1;
  for (let p = 0; p < samples.length; p += window) {
    let sum = 0;
    const n = Math.min(window, samples.length - p);
    for (let i = 0; i < n; i++) sum += samples[p + i] ** 2;
    if (Math.sqrt(sum / n) > 0.0025) {
      if (first < 0) first = p;
      last = p + n;
    }
  }
  if (first < 0) throw new Error('Speech clip is silent');
  return {
    start: Math.max(0, first - Math.round(rate * 0.055)) / rate,
    end: Math.min(samples.length, last + Math.round(rate * 0.1)) / rate,
  };
}

import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { argsObject, ROOT, OUT, ffmpeg, command } from './common.js';
import { prepareNarration } from './narration.js';
import { makeVoiceScore } from './audio-voice-score.js';
import { readWave, writeWave, AUDIO_RATE } from './wave.js';
import { VOICE_CUES } from './voice-timeline.js';
const args = argsObject(),
  work = resolve(OUT, 'voice-v2'),
  out = resolve(OUT, 'portrait', 'zh');
const name = String(args.name || 'air-poker-douyin-voice-v2');
if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid filename');
await mkdir(out, { recursive: true });
await mkdir(work, { recursive: true });
const commands = [];
const exec = async (a) => {
  commands.push([ffmpeg, ...a]);
  return command(ffmpeg, a);
};
let narration;
if (args['skip-tts']) {
  narration = {
    file: resolve(work, 'narration.wav'),
    manifest: JSON.parse(await readFile(resolve(work, 'narration.json'), 'utf8')),
  };
  if (
    JSON.stringify(
      narration.manifest.cues.map(({ id, start, end, text }) => ({ id, start, end, text })),
    ) !== JSON.stringify(VOICE_CUES)
  )
    throw new Error('Cached narration no longer matches the script');
} else narration = await prepareNarration(args);
const stems = await makeVoiceScore();
const normalizedMusic = resolve(work, 'music-balanced.wav');
await exec([
  '-hide_banner',
  '-y',
  '-i',
  stems.music,
  '-af',
  'highpass=f=40,equalizer=f=2400:t=q:w=0.7:g=-2,loudnorm=I=-23:TP=-6:LRA=7',
  '-ar',
  '48000',
  '-ac',
  '2',
  '-c:a',
  'pcm_s16le',
  normalizedMusic,
]);
const music = await readWave(normalizedMusic),
  voice = await readWave(narration.file);
if (music.rate !== AUDIO_RATE || voice.rate !== AUDIO_RATE || Math.abs(voice.duration - 30) > 0.02)
  throw new Error('Expected 30-second 48 kHz narration');
const smooth = (x) => {
  const p = Math.max(0, Math.min(1, x));
  return p * p * (3 - 2 * p);
};
const gains = new Float32Array(music.frames);
for (let i = 0; i < music.frames; i++) {
  const t = i / AUDIO_RATE;
  let speech = 0;
  for (const cue of narration.manifest.cues) {
    const enter = smooth((t - (cue.start - 0.1)) / 0.1),
      leave = 1 - smooth((t - (cue.spokenEnd + 0.06)) / 0.42);
    speech = Math.max(speech, enter * leave);
  }
  // Roughly 11 dB of smooth attenuation; starts before the first consonant, releases after the sentence.
  const gain = 1 - 0.72 * speech;
  gains[i] = gain;
  for (const channel of music.samples) channel[i] *= gain;
}
const ducked = resolve(work, 'music-ducked.wav');
await writeWave(ducked, music.samples);
const clarity = narration.manifest.cues.map((cue) => {
  let speech = 0,
    bed = 0,
    n = 0;
  const start = Math.round(cue.start * AUDIO_RATE),
    end = Math.min(voice.frames, Math.round(cue.spokenEnd * AUDIO_RATE));
  for (let i = start; i < end; i++) {
    speech += voice.samples[0][i] ** 2;
    bed += (music.samples[0][i] ** 2 + music.samples[1][i] ** 2) / 2;
    n++;
  }
  return {
    id: cue.id,
    voiceRmsDb: 10 * Math.log10(speech / n),
    musicRmsDb: 10 * Math.log10(bed / n),
    voiceAboveMusicDb: 10 * Math.log10(speech / bed),
  };
});
const mixed = resolve(work, 'voice-mix.wav');
await exec([
  '-hide_banner',
  '-y',
  '-i',
  narration.file,
  '-i',
  ducked,
  '-i',
  stems.fx,
  '-filter_complex',
  '[0:a]asplit=2[voice][detector];[2:a]highpass=f=45,lowpass=f=8500,volume=0.55[fx];[fx][detector]sidechaincompress=threshold=0.035:ratio=3:attack=8:release=200:makeup=1[controlled];[voice][1:a][controlled]amix=inputs=3:duration=first:normalize=0,afade=t=out:st=29.4:d=0.6[a]',
  '-map',
  '[a]',
  '-ar',
  '48000',
  '-ac',
  '2',
  '-c:a',
  'pcm_s16le',
  mixed,
]);
const measurement = await exec([
  '-hide_banner',
  '-i',
  mixed,
  '-af',
  'loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json',
  '-f',
  'null',
  '-',
]);
const loudness = JSON.parse(
  [...measurement.stderr.matchAll(/\{[^{}]*"input_i"[^{}]*\}/gs)].at(-1)[0],
);
const norm =
  'loudnorm=I=-14:TP=-1.5:LRA=7:measured_I=' +
  loudness.input_i +
  ':measured_LRA=' +
  loudness.input_lra +
  ':measured_TP=' +
  loudness.input_tp +
  ':measured_thresh=' +
  loudness.input_thresh +
  ':offset=' +
  loudness.target_offset +
  ':linear=true';
const source = resolve(ROOT, 'promo/releases/portrait-v1/zh/air-poker-douyin-30s.mp4'),
  target = resolve(out, name + '.mp4');
await exec([
  '-hide_banner',
  '-y',
  '-i',
  source,
  '-i',
  mixed,
  '-map',
  '0:v:0',
  '-map',
  '1:a:0',
  '-c:v',
  'copy',
  '-af',
  norm +
    ',lowpass=f=11000,aresample=192000,alimiter=limit=0.78:level=false:attack=5:release=90:latency=true,aresample=48000',
  '-c:a',
  'aac',
  '-b:a',
  '320k',
  '-ar',
  '48000',
  '-ac',
  '2',
  '-t',
  '30',
  '-movflags',
  '+faststart',
  target,
]);
const videoHash = async (file) =>
  (
    await exec([
      '-hide_banner',
      '-v',
      'error',
      '-i',
      file,
      '-map',
      '0:v:0',
      '-c:v',
      'copy',
      '-f',
      'hash',
      '-hash',
      'sha256',
      '-',
    ])
  ).stdout.trim();
const oldHash = await videoHash(source),
  newHash = await videoHash(target);
if (oldHash !== newHash) throw new Error('Video packet stream changed');
const sourceManifest = JSON.parse(
  await readFile(
    resolve(ROOT, 'promo/releases/portrait-v1/zh/air-poker-douyin-30s.render.json'),
    'utf8',
  ),
);
await copyFile(resolve(work, 'narration.srt'), resolve(out, name + '.narration.srt'));
await copyFile(
  resolve(ROOT, 'promo/releases/portrait-v1/zh/air-poker-douyin-30s.srt'),
  resolve(out, name + '.srt'),
);
await writeFile(
  resolve(out, name + '.render.json'),
  JSON.stringify(
    {
      ...sourceManifest,
      file: basename(target),
      encoder: 'copy',
      videoReused: true,
      videoPacketHash: newHash,
      voice: narration.manifest,
      music:
        'Original 120 BPM voice-led score, three stems, speech-timed music attenuation and sidechain-controlled effects',
      loudnessInput: loudness,
      clarity,
      commands,
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  resolve(work, 'mix-report.json'),
  JSON.stringify(
    {
      voice: narration.manifest.voice,
      synthetic: true,
      musicDuckDb: 20 * Math.log10(0.28),
      clarity,
      videoPacketHash: newHash,
      videoUnchanged: true,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ file: target, clarity, videoUnchanged: true }, null, 2));

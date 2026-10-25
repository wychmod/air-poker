import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ROOT, OUT, ffmpeg, command, execute, argsObject } from './common.js';
import { AUDIO_RATE, readWave, writeWave, speechExtent } from './wave.js';
import { VOICE_CUES, VOICE_DURATION, fitVoice } from './voice-timeline.js';
import { srtTime } from '../../promo/timeline.js';
export async function prepareNarration(args = {}) {
  const dir = resolve(OUT, 'voice-v2'),
    clips = resolve(dir, 'clips');
  await mkdir(clips, { recursive: true });
  const voice = String(args.voice || 'zh-CN-YunxiNeural'),
    rate = String(args.rate || '+8%'),
    pitch = String(args.pitch || '-2Hz');
  const python = process.env.PYTHON_BIN || 'python';
  const packages = process.env.TTS_PACKAGES || resolve(dir, 'python-packages');
  const bootstrap =
    'import sys,runpy;sys.path.insert(0,' +
    JSON.stringify(packages) +
    ');runpy.run_module("edge_tts",run_name="__main__")';
  const track = new Float32Array(AUDIO_RATE * VOICE_DURATION),
    cues = [];
  for (const cue of VOICE_CUES) {
    const mp3 = resolve(clips, cue.id + '.mp3'),
      cache = resolve(clips, cue.id + '.json');
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ voice, rate, pitch, text: cue.text }))
      .digest('hex');
    let reusable = false;
    try {
      reusable = JSON.parse(await readFile(cache, 'utf8')).fingerprint === fingerprint;
      await access(mp3);
    } catch {
      reusable = false;
    }
    if (!reusable || args.refresh) {
      console.log('Synthesizing ' + cue.id);
      await execute(
        python,
        [
          '-c',
          bootstrap,
          '--no-progress',
          '--voice',
          voice,
          '--rate=' + rate,
          '--pitch=' + pitch,
          '--text',
          cue.text,
          '--write-media',
          mp3,
        ],
        { cwd: ROOT, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 },
      );
      await writeFile(
        cache,
        JSON.stringify({ fingerprint, voice, rate, pitch, text: cue.text }, null, 2) + '\n',
      );
    }
    const decoded = resolve(clips, cue.id + '.decoded.wav');
    await command(ffmpeg, [
      '-hide_banner',
      '-y',
      '-i',
      mp3,
      '-ac',
      '1',
      '-ar',
      String(AUDIO_RATE),
      '-c:a',
      'pcm_s16le',
      decoded,
    ]);
    const source = await readWave(decoded),
      extent = speechExtent(source.samples[0]);
    const fit = fitVoice(extent.end - extent.start, cue);
    const aligned = resolve(clips, cue.id + '.aligned.wav');
    await command(ffmpeg, [
      '-hide_banner',
      '-y',
      '-i',
      decoded,
      '-af',
      'atrim=start=' +
        extent.start +
        ':end=' +
        extent.end +
        ',asetpts=PTS-STARTPTS,atempo=' +
        fit.speed +
        ',afade=t=in:d=0.005',
      '-ac',
      '1',
      '-ar',
      String(AUDIO_RATE),
      '-c:a',
      'pcm_s16le',
      aligned,
    ]);
    const processed = await readWave(aligned),
      offset = Math.round(cue.start * AUDIO_RATE);
    if (processed.duration > cue.end - cue.start + 0.015)
      throw new Error(cue.id + ': processed speech exceeds its window');
    for (let i = 0; i < processed.frames; i++) {
      const endFade = Math.min(1, (processed.frames - 1 - i) / (AUDIO_RATE * 0.008));
      track[offset + i] = processed.samples[0][i] * endFade;
    }
    cues.push({
      ...cue,
      spokenEnd: cue.start + processed.duration,
      sourceDuration: source.duration,
      trim: extent,
      speed: fit.speed,
    });
    console.log(cue.id + ': ' + processed.duration.toFixed(3) + 's, tempo ' + fit.speed.toFixed(3));
  }
  const raw = resolve(dir, 'narration-raw.wav'),
    output = resolve(dir, 'narration.wav');
  await writeWave(raw, [track]);
  await command(ffmpeg, [
    '-hide_banner',
    '-y',
    '-i',
    raw,
    '-af',
    'highpass=f=90,equalizer=f=260:t=q:w=0.8:g=-2,loudnorm=I=-18:TP=-3:LRA=5',
    '-ar',
    String(AUDIO_RATE),
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    output,
  ]);
  const result = {
    voice,
    rate,
    pitch,
    provider: 'Microsoft Edge online neural speech via edge-tts 7.3.1',
    synthetic: true,
    duration: VOICE_DURATION,
    cues,
  };
  await writeFile(resolve(dir, 'narration.json'), JSON.stringify(result, null, 2) + '\n');
  await writeFile(
    resolve(dir, 'narration.srt'),
    cues
      .map(
        (cue, i) =>
          i +
          1 +
          '\n' +
          srtTime(cue.start) +
          ' --> ' +
          srtTime(cue.spokenEnd) +
          '\n' +
          cue.text +
          '\n',
      )
      .join('\n'),
  );
  return { file: output, manifest: result };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await prepareNarration(argsObject());

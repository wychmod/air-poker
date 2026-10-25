import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { argsObject, ffmpeg, command, OUT, ROOT, browserEngine } from './common.js';
import { startServer } from './server.js';
import { prepare } from './prepare.js';
import { makeAudio } from './audio.js';
import { captureGame } from './capture.js';
import { DURATION, FPS, SCENES, toSrt } from '../../promo/timeline.js';
const args = argsObject();
const start = Number(args.start ?? 0),
  end = Number(args.end ?? DURATION),
  fps = Number(args.fps ?? FPS),
  width = Number(args.width ?? 1920),
  height = (width * 9) / 16;
if (
  !Number.isFinite(start) ||
  !Number.isFinite(end) ||
  start < 0 ||
  end > DURATION ||
  end <= start ||
  !Number.isInteger(fps) ||
  fps < 15 ||
  fps > 60 ||
  !Number.isInteger(width) ||
  width < 320 ||
  width > 3840 ||
  width % 2 ||
  !Number.isInteger(height) ||
  height % 2
)
  throw new Error('Invalid range, fps or 16:9 dimensions');
const frames = Math.round((end - start) * fps),
  duration = frames / fps;
if (Math.abs(duration - (end - start)) > 0.0001)
  throw new Error('Range must contain a whole number of frames');
const name = String(args.name || 'air-poker-bilibili-72s');
if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Name must be a plain filename');
if (args.voice) await access(resolve(String(args.voice)));
if (args.music) await access(resolve(String(args.music)));
await mkdir(OUT, { recursive: true });
await prepare();
await makeAudio();
const server = await startServer();
let browser, encoder;
const commands = [];
const exec = async (a) => {
  commands.push([ffmpeg, ...a]);
  return command(ffmpeg, a);
};
try {
  if (!args['skip-capture'] && !args['audio-only']) await captureGame(server.url);
  for (const name of ['build', 'showdown', 'review'])
    await access(resolve(OUT, 'captures', name + '.png'));
  if (args['prepare-only']) {
    console.log('Prepared ' + OUT);
  } else {
    const previous = args['audio-only']
      ? JSON.parse(await readFile(resolve(OUT, name + '.render.json'), 'utf8'))
      : null;
    if (previous) {
      for (const [key, value] of Object.entries({ start, end, fps, width, height, frames }))
        if (previous[key] !== value) throw new Error('Existing video differs: ' + key);
      await access(resolve(OUT, name + '.silent.mp4'));
    }
    const errors = [];
    const listing = await exec(['-hide_banner', '-encoders']);
    const chosen =
      previous?.encoder ||
      args.encoder ||
      (listing.stdout.includes('libx264') ? 'libx264' : 'h264_nvenc');
    if (!['libx264', 'h264_nvenc'].includes(chosen))
      throw new Error('Supported encoders: libx264, h264_nvenc');
    const settings =
      chosen === 'libx264'
        ? ['-preset', 'medium', '-crf', '18']
        : [
            '-preset',
            'p5',
            '-rc',
            'vbr',
            '-cq',
            '18',
            '-b:v',
            '12M',
            '-maxrate',
            '20M',
            '-bufsize',
            '24M',
          ];
    const silent = resolve(OUT, name + '.silent.mp4');
    const output = resolve(OUT, name + '.mp4');
    const videoArgs = [
      '-hide_banner',
      '-y',
      '-f',
      'image2pipe',
      '-framerate',
      String(fps),
      '-vcodec',
      'mjpeg',
      '-i',
      'pipe:0',
      '-an',
      '-vf',
      'scale=' +
        width +
        ':' +
        height +
        ':flags=lanczos:in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
      '-c:v',
      chosen,
      ...settings,
      '-g',
      String(fps * 2),
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-colorspace',
      'bt709',
      '-color_range',
      'tv',
      '-movflags',
      '+faststart',
      silent,
    ];
    if (!previous) {
      // Fail before rendering thousands of frames when the requested hardware encoder is unavailable.
      await exec([
        '-hide_banner',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=white:s=320x180:r=30:d=0.1',
        '-c:v',
        chosen,
        ...settings,
        '-f',
        'null',
        '-',
      ]);
      browser = await (await browserEngine()).launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(server.url + '/promo/index.html?capture');
      await page.evaluate(() => globalThis.promo.ready);
      const png = async (t, path, cover = false) => {
        const data = await page.evaluate(
          ({ t, cover }) => {
            globalThis.promo.renderAt(t, { cover });
            return document.querySelector('#film').toDataURL('image/png').split(',')[1];
          },
          { t, cover },
        );
        await writeFile(path, Buffer.from(data, 'base64'));
      };
      await png(68, resolve(OUT, 'cover.png'), true);
      await mkdir(resolve(OUT, 'storyboard'), { recursive: true });
      for (const [index, s] of SCENES.entries())
        await png(
          s.start + (s.end - s.start) * 0.67,
          resolve(OUT, 'storyboard', String(index + 1).padStart(2, '0') + '-' + s.id + '.png'),
        );
      const contact = await page.evaluate(() => {
        const out = document.createElement('canvas');
        out.width = 1920;
        out.height = 1440;
        const ctx = out.getContext('2d');
        globalThis.promo.scenes.forEach((s, i) => {
          globalThis.promo.renderAt(s.start + (s.end - s.start) * 0.67);
          ctx.drawImage(
            document.querySelector('#film'),
            (i % 3) * 640,
            Math.floor(i / 3) * 360,
            640,
            360,
          );
        });
        return out.toDataURL('image/png').split(',')[1];
      });
      await writeFile(resolve(OUT, 'storyboard-contact.png'), Buffer.from(contact, 'base64'));
      // Verify arbitrary seeking does not change the result at the same absolute time.
      const hashFrame = async (t) =>
        page.evaluate((t) => {
          globalThis.promo.renderAt(t);
          return document.querySelector('#film').toDataURL('image/jpeg', 0.8);
        }, t);
      const a = await hashFrame(40);
      await hashFrame(3);
      const b = await hashFrame(40);
      if (a !== b) throw new Error('Rendering is not deterministic');
      commands.push([ffmpeg, ...videoArgs]);
      encoder = spawn(ffmpeg, videoArgs, {
        cwd: ROOT,
        windowsHide: true,
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      let encoderLog = '',
        failure;
      encoder.stderr.on('data', (d) => {
        encoderLog = (encoderLog + d).slice(-20000);
      });
      encoder.on('error', (e) => {
        failure = e;
      });
      encoder.stdin.on('error', (e) => {
        failure = e;
      });
      const completion = new Promise((ok, fail) => {
        encoder.on('error', fail);
        encoder.on('close', (code) =>
          code === 0 ? ok() : fail(new Error('Encoder failed: ' + encoderLog)),
        );
      });
      // Attach a handler immediately to avoid unhandled rejections while Chrome renders.
      completion.catch((e) => {
        failure = e;
      });
      const started = Date.now();
      for (let i = 0; i < frames; i++) {
        if (failure) throw failure;
        const data = await page.evaluate(
          (t) => {
            globalThis.promo.renderAt(t);
            return document.querySelector('#film').toDataURL('image/jpeg', 0.97).split(',')[1];
          },
          start + i / fps,
        );
        if (!encoder.stdin.write(Buffer.from(data, 'base64')))
          await Promise.race([once(encoder.stdin, 'drain'), completion]);
        if (i % 150 === 0)
          console.log(
            'Frame ' + i + '/' + frames + ' · ' + Math.round((Date.now() - started) / 1000) + 's',
          );
      }
      encoder.stdin.end();
      await completion;
      if (errors.length) throw new Error(errors.join('\n'));
    } else {
      commands.push(...previous.commands.filter((command) => command.includes('image2pipe')));
      console.log('Reusing verified geometry of silent video: ' + silent);
    }
    const mixed = resolve(OUT, name + '.mix.wav');
    const music = resolve(OUT, 'score.wav');
    if (args.voice) {
      await exec([
        '-hide_banner',
        '-y',
        '-i',
        args.music ? resolve(String(args.music)) : music,
        '-i',
        resolve(String(args.voice)),
        '-filter_complex',
        '[0:a]apad,atrim=duration=72,volume=0.38[m];[1:a]apad,atrim=duration=72[v];[m][v]amix=inputs=2:duration=first:normalize=0[a]',
        '-map',
        '[a]',
        '-ar',
        '48000',
        '-ac',
        '2',
        mixed,
      ]);
    } else if (args.music) {
      await exec([
        '-hide_banner',
        '-y',
        '-i',
        resolve(String(args.music)),
        '-af',
        'apad,atrim=duration=72,afade=t=out:st=70.8:d=1.2',
        '-ar',
        '48000',
        '-ac',
        '2',
        mixed,
      ]);
    }
    const audioInput = args.voice || args.music ? mixed : music;
    const measured = await exec([
      '-hide_banner',
      '-ss',
      String(start),
      '-t',
      String(duration),
      '-i',
      audioInput,
      '-af',
      'loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json',
      '-f',
      'null',
      '-',
    ]);
    const matches = [...measured.stderr.matchAll(/\{[^{}]*"input_i"[^{}]*\}/gs)];
    if (!matches.length) throw new Error('No loudnorm measurement');
    const loudness = JSON.parse(matches.at(-1)[0]);
    if (!Number.isFinite(Number(loudness.input_i))) throw new Error('Audio is silent');
    const norm =
      'loudnorm=I=-14:TP=-1.5:LRA=9:measured_I=' +
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
    await exec([
      '-hide_banner',
      '-y',
      '-i',
      silent,
      '-ss',
      String(start),
      '-t',
      String(duration),
      '-i',
      audioInput,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-af',
      norm +
        ',lowpass=f=10000,aresample=192000,alimiter=limit=0.60:level=false:attack=5:release=80:latency=true,aresample=48000',
      '-c:a',
      'aac',
      '-b:a',
      '320k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-t',
      String(duration),
      '-movflags',
      '+faststart',
      output,
    ]);
    await writeFile(resolve(OUT, name + '.srt'), toSrt(start, end));
    await writeFile(
      resolve(OUT, name + '.render.json'),
      JSON.stringify(
        {
          file: basename(output),
          start,
          end,
          duration,
          frames,
          fps,
          width,
          height,
          encoder: chosen,
          browser: browser?.version() ?? previous.browser,
          videoReused: Boolean(previous),
          deterministic: true,
          errors,
          loudnessInput: loudness,
          voice: args.voice || null,
          music: args.music || 'original procedural score',
          commands,
        },
        null,
        2,
      ),
    );
    console.log('Rendered ' + output);
  }
} finally {
  if (encoder && encoder.exitCode === null) encoder.kill();
  await browser?.close();
  await server.close();
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const repo = resolve(root, '../..');
const output = resolve(root, 'out');
const evidence = resolve(output, 'verification');
await mkdir(evidence, { recursive: true });
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command} failed: ${result.stderr || result.error}`);
  return result;
};
const sha = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
const report = {
  passed: false,
  files: [],
  evidence: {},
  limitations: [
    'Audio was measured from the rendered AAC track; subjective listening has not been verified.',
    'Pixel parity samples and deterministic source checks do not claim every possible workbench edit was tested.',
  ],
};
for (const name of ['air-poker-promo.mp4', 'air-poker-promo-clean.mp4']) {
  const path = resolve(output, name);
  const probe = JSON.parse(
    run('ffprobe', [
      '-v',
      'error',
      '-count_frames',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      path,
    ]).stdout,
  );
  const video = probe.streams.find((s) => s.codec_type === 'video');
  const audio = probe.streams.filter((s) => s.codec_type === 'audio');
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(video.r_frame_rate, '30/1');
  assert.equal(Number(video.nb_read_frames), 900);
  assert.ok(Math.abs(Number(probe.format.duration) - 30) < 0.05);
  assert.equal(audio.length, name.includes('clean') ? 0 : 1);
  run('ffmpeg', ['-v', 'error', '-xerror', '-i', path, '-f', 'null', '-']);
  const hashes = run('ffmpeg', [
    '-v',
    'error',
    '-i',
    path,
    '-map',
    '0:v:0',
    '-f',
    'framemd5',
    '-',
  ]).stdout;
  await writeFile(resolve(evidence, `${name}.framemd5`), hashes);
  report.files.push({
    name,
    sha256: await sha(path),
    width: video.width,
    height: video.height,
    frames: Number(video.nb_read_frames),
    fps: video.r_frame_rate,
    seconds: Number(probe.format.duration),
    videoCodec: video.codec_name,
    audioTracks: audio.length,
    bytes: Number(probe.format.size),
    decodedWithoutErrors: true,
  });
}
const a = await readFile(resolve(evidence, 'air-poker-promo.mp4.framemd5'), 'utf8');
const b = await readFile(resolve(evidence, 'air-poker-promo-clean.mp4.framemd5'), 'utf8');
assert.equal(a, b, 'The two video tracks differ');
report.evidence.videoFramesIdentical = 900;
const mix = run('ffmpeg', [
  '-hide_banner',
  '-i',
  resolve(output, 'air-poker-promo.mp4'),
  '-vn',
  '-af',
  'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
  '-f',
  'null',
  '-',
]).stderr;
await writeFile(resolve(evidence, 'audio-analysis.log'), mix);
const measurements = JSON.parse(mix.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/)?.[0] || '{}');
assert.ok(Number.isFinite(Number(measurements.input_tp)));
assert.ok(Number(measurements.input_tp) < 0, 'Audio clips');
report.evidence.audio = {
  integratedLufs: Number(measurements.input_i),
  truePeakDbtp: Number(measurements.input_tp),
  loudnessRangeLu: Number(measurements.input_lra),
  subjectivelyAuditioned: false,
};
const manifest = JSON.parse(await readFile(resolve(root, 'public/captures/capture-manifest.json')));
for (const entry of [...manifest.captured, ...Object.values(manifest.elements)]) {
  assert.equal(
    await sha(resolve(root, 'public/captures', entry.file)),
    entry.sha256,
    `Capture hash: ${entry.file}`,
  );
}
assert.equal(manifest.errors.length, 0);
const audioManifest = JSON.parse(await readFile(resolve(root, 'public/audio/audio-manifest.json')));
assert.equal(await sha(resolve(root, 'public/audio', audioManifest.file)), audioManifest.sha256);
report.evidence.frozenAssetHashesPassed =
  manifest.captured.length + Object.keys(manifest.elements).length + 1;
const { makeFacts } = await import(pathToFileURL(resolve(repo, 'scripts/promo/prepare.js')).href);
assert.deepEqual(
  JSON.parse(await readFile(resolve(root, 'public/captures/rule-facts.json'))),
  makeFacts(),
);
report.evidence.ruleIllustrationVerified = true;
const scan = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (/\.[jt]sx?$/.test(entry.name))
      assert.doesNotMatch(
        await readFile(path, 'utf8'),
        /\b(?:Math\.random|Date\.now|performance\.now)\s*\(/,
        path,
      );
  }
};
await scan(resolve(root, 'src'));
report.evidence.timelineUsesFrameBasedMotion = true;
const frames = [
  0, 12, 55, 75, 85, 89, 90, 112, 158, 220, 250, 269, 270, 280, 342, 395, 419, 420, 432, 486, 548,
  569, 570, 582, 610, 660, 695, 704, 705, 720, 750, 780, 810, 840, 870, 899,
];
const stills = resolve(evidence, 'frames');
await mkdir(stills, { recursive: true });
for (const frame of frames) {
  run('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    resolve(output, 'air-poker-promo.mp4'),
    '-vf',
    `select=eq(n\\,${frame})`,
    '-frames:v',
    '1',
    resolve(stills, `f${String(frame).padStart(3, '0')}.png`),
  ]);
}
const contact = `
from pathlib import Path
from PIL import Image,ImageDraw
p=Path(r'${stills.replace(/'/g, "\\'")}')
files=sorted(p.glob('f*.png'))
canvas=Image.new('RGB',(2000,((len(files)+3)//4)*300),'#ddd')
for i,f in enumerate(files):
 im=Image.open(f).convert('RGB'); im.thumbnail((480,270))
 x=(i%4)*500; y=(i//4)*300
 canvas.paste(im,(x+10,y+5)); ImageDraw.Draw(canvas).text((x+12,y+278),f.stem,fill='#111')
canvas.save(p.parent/'contact-sheet.jpg',quality=94)
`;
run('python', ['-c', contact]);
report.evidence.framesExtractedFromFinalMp4 = frames;
report.passed = true;
await writeFile(resolve(evidence, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

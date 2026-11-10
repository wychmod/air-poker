// Package a 30-second master and remove BGM without re-encoding any video frame.
import { spawnSync } from 'node:child_process';
import { rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const master = resolve(root, 'out/air-poker-promo.mp4');
const clean = resolve(root, 'out/air-poker-promo-clean.mp4');
const run = (args) => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`ffmpeg exited ${result.status}`);
};
if (!process.argv.includes('--clean')) {
  const temp = resolve(root, 'out/air-poker-promo-finalized.mp4');
  run([
    '-i',
    master,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-c:v',
    'copy',
    '-af',
    'atrim=duration=30,asetpts=PTS-STARTPTS',
    '-c:a',
    'aac',
    '-b:a',
    '320k',
    '-t',
    '30',
    '-movflags',
    '+faststart',
    temp,
  ]);
  await rename(temp, master);
}
// There are no SFX in this film: its no-BGM delivery is intentionally silent.
run(['-i', master, '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', clean]);
console.log('Packaged 30-second master and an identical video track with no audio.');

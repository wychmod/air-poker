import { resolve } from 'node:path';
import * as landscape from '../../promo/timeline.js';
import * as portrait from '../../promo/portrait/timeline.js';
import { OUT } from './common.js';
import { makeAudio } from './audio.js';
import { makePortraitAudio } from './audio-portrait.js';
import { captureGame } from './capture.js';
import { capturePortrait } from './capture-portrait.js';
export function getComposition(format = 'landscape', lang = 'zh') {
  if (!['landscape', 'portrait'].includes(format)) throw new Error('Unknown format: ' + format);
  if (!['zh', 'en'].includes(lang) || (format === 'landscape' && lang !== 'zh'))
    throw new Error('Unsupported language for this format');
  const vertical = format === 'portrait',
    timeline = vertical ? portrait : landscape;
  return {
    audioGainDb: vertical ? 0.8 : 0,
    format,
    lang,
    timeline,
    width: timeline.WIDTH,
    height: timeline.HEIGHT,
    duration: timeline.DURATION,
    fps: timeline.FPS,
    out: vertical ? resolve(OUT, 'portrait', lang) : OUT,
    name: vertical
      ? lang === 'zh'
        ? 'air-poker-douyin-30s'
        : 'air-poker-tiktok-30s'
      : 'air-poker-bilibili-72s',
    page: vertical ? '/promo/portrait/index.html?lang=' + lang : '/promo/index.html',
    captures: vertical ? ['build', 'showdown'] : ['build', 'showdown', 'review'],
    makeAudio: vertical ? () => makePortraitAudio(lang) : makeAudio,
    capture: vertical ? (url) => capturePortrait(url, lang) : captureGame,
    toSrt: (start, end) =>
      vertical ? portrait.toSrt(start, end, lang) : landscape.toSrt(start, end),
  };
}
export function frameSettings(composition, args = {}) {
  const start = Number(args.start ?? 0),
    end = Number(args.end ?? composition.duration),
    fps = Number(args.fps ?? composition.fps),
    width = Number(args.width ?? composition.width),
    height = (width * composition.height) / composition.width;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end > composition.duration ||
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
    throw new Error('Invalid range, fps or composition dimensions');
  const frames = Math.round((end - start) * fps),
    duration = frames / fps;
  if (Math.abs(duration - (end - start)) > 0.0001)
    throw new Error('Range must contain a whole number of frames');
  return { start, end, fps, width, height, frames, duration };
}

// Voice-led edit: speech windows leave room for impacts and the final title hold.
export const VOICE_DURATION = 30;
export const VOICE_CUES = [
  { id: 'hook', start: 0.1, end: 2.42, text: '这局扑克，赌的是呼吸。' },
  { id: 'air', start: 2.68, end: 5.38, text: '每人二十五罐，下注也要留气。' },
  { id: 'build', start: 5.72, end: 9.28, text: '五张不同的牌，凑点数，拼牌型。' },
  { id: 'overlap', start: 9.74, end: 12.36, text: '双方有效，撞上同一张牌。' },
  { id: 'burn', start: 12.7, end: 15.27, text: '输家，还要额外烧掉空气。' },
  { id: 'twist', start: 16.02, end: 17.86, text: '赢牌，未必赢局。' },
  { id: 'endurance', start: 18.23, end: 21.72, text: '五轮之后，还要比谁撑得更久。' },
  { id: 'play', start: 22.18, end: 25.28, text: '空气扑克，打开浏览器就能玩。' },
  { id: 'choice', start: 26.02, end: 29.4, text: '你会加注，还是留气？' },
];
export function fitVoice(duration, cue, maxSpeed = 1.16) {
  if (!Number.isFinite(duration) || duration <= 0 || cue.end <= cue.start)
    throw new Error('Invalid speech duration');
  const room = cue.end - cue.start;
  const speed = Math.max(1, duration / room);
  if (speed > maxSpeed)
    throw new Error(
      cue.id + ': shorten the wording or regenerate faster; required speed ' + speed.toFixed(3),
    );
  return { speed, duration: duration / speed, start: cue.start, end: cue.start + duration / speed };
}

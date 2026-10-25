import { srtTime } from '../timeline.js';
export const WIDTH = 1080,
  HEIGHT = 1920,
  FPS = 30,
  DURATION = 30,
  BPM = 140;
export const SAFE = { left: 72, top: 180, right: 882, bottom: 1536 };
export const SCENES = [
  { id: 'hook', start: 0, end: 2.5, label: '筹码就是呼吸', en: 'Bet your breath' },
  { id: 'air', start: 2.5, end: 5.5, label: '25 罐空气', en: '25 cans' },
  { id: 'build', start: 5.5, end: 9.5, label: '自己构牌', en: 'Build your hand' },
  { id: 'calamity', start: 9.5, end: 15.5, label: '撞牌与灾厄', en: 'The overlap' },
  { id: 'twist', start: 15.5, end: 18, label: '赢一轮 ≠ 赢整局', en: 'A hand is not the match' },
  { id: 'endurance', start: 18, end: 22, label: '耐息终局', en: 'Survive' },
  { id: 'gameplay', start: 22, end: 25.5, label: '真实手机界面', en: 'Real browser game' },
  { id: 'cta', start: 25.5, end: 30, label: '加注还是留气', en: 'Raise or save your air' },
];
const lines = [
  [0, 2.5, '这局扑克，赌的是呼吸。', 'Your next breath is on the table.'],
  [2.5, 5.5, '每人 25 罐。下注，也要留气。', '25 cans each. Bet them. Breathe them.'],
  [5.5, 9.5, '五张不同的牌。凑点数，拼牌型。', 'Five different cards. Hit the target.'],
  [9.5, 12.5, '有效成手撞牌，还要分出胜负。', 'Both hands valid. Shared cards. A winner.'],
  [12.5, 15.5, '败者，还会额外烧毁空气。', 'The loser burns extra air.'],
  [15.5, 18, '赢下这一轮，不等于活到最后。', 'Winning a hand is not surviving.'],
  [18, 22, '五轮后耐息。把气留到最后。', 'After five rounds: endurance.'],
  [22, 25.5, '真能玩。浏览器打开，就能入局。', 'A real game. Play in your browser.'],
  [25.5, 30, '你会加注，还是留气？', 'Would you raise, or save your air?'],
];
export function getCaptions(lang = 'zh') {
  if (!['zh', 'en'].includes(lang)) throw new Error('Unsupported language');
  return lines.map(([a, b, zh, en]) => [a, b, lang === 'en' ? en : zh]);
}
export function sceneAt(t) {
  return SCENES.find((s) => t >= s.start && t < s.end) ?? SCENES.at(-1);
}
export function toSrt(start = 0, end = DURATION, lang = 'zh') {
  return getCaptions(lang)
    .filter(([a, b]) => a < end && b > start)
    .map(
      ([a, b, s], i) =>
        i +
        1 +
        '\n' +
        srtTime(Math.max(a, start) - start) +
        ' --> ' +
        srtTime(Math.min(b, end) - start) +
        '\n' +
        s +
        '\n',
    )
    .join('\n');
}

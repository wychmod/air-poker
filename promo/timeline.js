export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;
export const DURATION = 72;
export const BPM = 120;
export const PLAY_URL = 'https://wychmod.github.io/air-poker/';
export const SCENES = [
  { id: 'hook', start: 0, end: 4, label: '赌的是呼吸' },
  { id: 'air', start: 4, end: 10, label: '一份空气 · 两种用途' },
  { id: 'target', start: 10, end: 16, label: '选一个数字' },
  { id: 'build', start: 16, end: 23, label: '构造完整五张牌' },
  { id: 'used', start: 23, end: 28, label: '每张牌 · 只用一次' },
  { id: 'bet', start: 28, end: 35, label: '押上未来的呼吸' },
  { id: 'calamity', start: 35, end: 44, label: '灾厄' },
  { id: 'twist', start: 44, end: 49, label: '赢牌 ≠ 赢局' },
  { id: 'endurance', start: 49, end: 56, label: '留住最后一口气' },
  { id: 'gameplay', start: 56, end: 62, label: '真实游戏界面' },
  { id: 'title', start: 62, end: 66, label: '空气扑克' },
  { id: 'cta', start: 66, end: 72, label: '现在 · 入局' },
];
export const CAPTIONS = [
  [0, 4, '这局扑克，赌的是呼吸。'],
  [4, 7, '每人 25 罐。'],
  [7, 10, '既是筹码，也是下一口空气。'],
  [10, 13, '五张数字牌。'],
  [13, 16, '每轮，选一个目标。'],
  [16, 19.5, '用五张不同的牌，凑出 24。'],
  [19.5, 23, '数字大，不代表牌型强。'],
  [23, 28, '这轮用掉的牌，下轮不能再用。'],
  [28, 31.5, '你敢加注，还是留气？'],
  [31.5, 35, '每次加注，都在押上未来的呼吸。'],
  [35, 38.5, '最危险的，是撞上同一张牌。'],
  [38.5, 41, '双方有效、实体重叠、分出胜负。'],
  [41, 44, '败者，还会额外烧毁空气。'],
  [44, 49, '赢下底池，未必赢下整局。'],
  [49, 52, '五轮之后，进入耐息。'],
  [52, 56, '把最后一口气，留到最后。'],
  [56, 58, '自由构牌。'],
  [58, 60, '交替下注，公开摊牌。'],
  [60, 62, '每一步，都能复盘。'],
  [62, 66, '你下注的，是下一口空气。'],
  [66, 69, '你会加注，还是留气？'],
  [69, 72, '简介链接，直接开局。'],
];
export function sceneAt(t) {
  return SCENES.find((s) => t >= s.start && t < s.end) ?? SCENES.at(-1);
}
export function srtTime(t) {
  const n = Math.round(t * 1000);
  return (
    [Math.floor(n / 3600000), Math.floor(n / 60000) % 60, Math.floor(n / 1000) % 60]
      .map((v) => String(v).padStart(2, '0'))
      .join(':') +
    ',' +
    String(n % 1000).padStart(3, '0')
  );
}
export function toSrt(start = 0, end = DURATION) {
  return CAPTIONS.filter(([a, b]) => a < end && b > start)
    .map(
      ([a, b, text], i) =>
        i +
        1 +
        '\n' +
        srtTime(Math.max(a, start) - start) +
        ' --> ' +
        srtTime(Math.min(b, end) - start) +
        '\n' +
        text +
        '\n',
    )
    .join('\n');
}

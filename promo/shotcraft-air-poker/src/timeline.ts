export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const SHOTS = {
  brand: { id: 'brand', label: '品牌开场', from: 0, duration: 90 },
  air: { id: 'air', label: 'AIR 资源聚焦', from: 90, duration: 180 },
  build: { id: 'build', label: '五张牌构造', from: 270, duration: 150 },
  wager: { id: 'wager', label: '隐藏信息下注', from: 420, duration: 150 },
  overlap: { id: 'overlap', label: '重叠与损失', from: 570, duration: 135 },
  finale: { id: 'finale', label: '账目与收尾', from: 705, duration: 195 },
} as const;

export const TOTAL_FRAMES = Object.values(SHOTS).reduce((sum, shot) => sum + shot.duration, 0);

export const CAPTIONS = [
  { from: SHOTS.brand.from + 8, duration: 68, text: '一场以空气为筹码的水下生存局。' },
  { from: SHOTS.air.from + 30, duration: 112, text: '空气，是筹码，也是生存时间。' },
  { from: SHOTS.build.from + 30, duration: 100, text: '五张不同的牌，凑出你的目标。' },
  { from: SHOTS.wager.from + 32, duration: 98, text: '下注之前，你看不见对手的牌。' },
  { from: SHOTS.overlap.from + 34, duration: 94, text: '有效成手重叠，败者额外损失空气。' },
  { from: SHOTS.finale.from + 2, duration: 65, text: '每次下注、每笔空气，都有记录。' },
] as const;

export const BGM = [
  { from: 0, duration: TOTAL_FRAMES, src: 'audio/air-poker-score.wav', volume: 0.72 },
];
export const SFX: { from: number; duration: number; src: string; volume: number }[] = [];

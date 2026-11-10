import { AirPokerPromo } from './film';
import { Caption } from './components/Caption';
import { UNITS } from './units';
import { BGM, CAPTIONS, FPS, HEIGHT, SFX, SHOTS, TOTAL_FRAMES, WIDTH } from './timeline';

const field = (key: string, label: string, value: string) => ({
  type: 'textarea',
  key,
  label,
  default: value,
});
const schemas = {
  brand: [
    field('title', '片名', '空气扑克'),
    field('kicker', '开场文案', '你下注的，是下一口空气。'),
  ],
  air: [field('heading', 'AIR 标题', '空气，也是时间。')],
  build: [field('heading', '构牌标题', '五张牌。一个目标。')],
  wager: [field('heading', '下注标题', '看见目标，猜不透底牌。')],
  overlap: [field('heading', '灾厄标题', '撞牌，会付出额外代价。')],
  finale: [
    field('title', '片名', '空气扑克'),
    field('cta', '结尾文案', '打开浏览器，即刻入局。'),
    field('url', '试玩网址', 'wychmod.github.io/air-poker'),
  ],
};

export const WORKBENCH = {
  name: '空气扑克 · 纸上牌桌',
  fps: FPS,
  width: WIDTH,
  height: HEIGHT,
  total: TOTAL_FRAMES,
  background: '#f3f2ee',
  revision: '1',
  shots: Object.values(SHOTS).map((shot) => ({
    ...shot,
    component: UNITS[shot.id],
    schema: schemas[shot.id],
    props: Object.fromEntries(schemas[shot.id].map((f) => [f.key, f.default])),
  })),
  captions: CAPTIONS.map((caption, index) => ({
    id: `caption-${index}`,
    label: `字幕 ${index + 1}`,
    from: caption.from,
    duration: caption.duration,
    component: Caption,
    props: { text: caption.text, duration: caption.duration },
    durationProp: 'duration',
    cardId: 'caption',
    cardName: '中文字幕',
    schema: [field('text', '字幕', caption.text)],
  })),
  transitions: [],
  overlays: [],
  sfx: SFX,
  bgm: BGM,
  original: AirPokerPromo,
};

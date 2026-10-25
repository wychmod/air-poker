import { WIDTH, HEIGHT, DURATION, SAFE, SCENES, sceneAt, getCaptions } from './timeline.js';
const canvas = document.querySelector('#film');
canvas.width = WIDTH;
canvas.height = HEIGHT;
const c = canvas.getContext('2d', { alpha: false });
export const lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh';
const en = lang === 'en',
  copy = (zh, eng) => (en ? eng : zh);
const PAPER = '#f2f0e9',
  INK = '#171916',
  RED = '#942b30',
  GRAY = '#69685f';
const SERIF = '"SimSun", "Noto Serif CJK SC", serif';
const SANS = '"Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const NUM = '"Bahnschrift", "Arial Narrow", sans-serif';
const CX = (SAFE.left + SAFE.right) / 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (v) => 1 - (1 - clamp(v)) ** 3;
const images = {};
let facts;
let seed = 421;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const particles = Array.from({ length: 38 }, () => ({
  x: rand() * WIDTH,
  y: rand() * HEIGHT,
  r: 3 + rand() * 14,
  v: 16 + rand() * 32,
  p: rand() * 6.28,
}));
const texture = document.createElement('canvas');
texture.width = 270;
texture.height = 480;
const tc = texture.getContext('2d');
for (let i = 0; i < 17000; i++) {
  tc.fillStyle = 'rgba(50,40,25,' + rand() * 0.09 + ')';
  tc.fillRect(rand() * 270, rand() * 480, 1, 1);
}
let textBounds = [];
function rect(x, y, w, h, fill = INK) {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
}
function line(x1, y1, x2, y2, width = 2, color = INK) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}
function text(
  s,
  x,
  y,
  size = 48,
  {
    color = INK,
    font = SANS,
    weight = 600,
    align = 'left',
    alpha = 1,
    max = 790,
    critical = true,
  } = {},
) {
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.font = weight + ' ' + size + 'px ' + font;
  const measured = c.measureText(String(s)).width;
  if (measured > max) {
    size *= max / measured;
    c.font = weight + ' ' + size + 'px ' + font;
  }
  const width = c.measureText(String(s)).width;
  if (critical && alpha > 0.9)
    textBounds.push({
      text: String(s),
      left: x - (align === 'center' ? width / 2 : align === 'right' ? width : 0),
      right: x + (align === 'center' ? width / 2 : align === 'right' ? 0 : width),
      top: y - size * 0.6,
      bottom: y + size * 0.6,
      size,
    });
  c.fillText(String(s), x, y);
  c.restore();
}
function center(s, y, size = 54, options = {}) {
  text(s, CX, y, size, { align: 'center', ...options });
}
function label(s, y = 228) {
  text(s, 82, y, 30, { font: NUM, color: GRAY, weight: 500, max: 650 });
}
function pill(s, y, w = 780, color = INK, size = 38) {
  rect(CX - w / 2, y, w, 74, color);
  center(s, y + 37, size, { color: PAPER, weight: 700, max: w - 36 });
}
function art(key, x, y, w, h, { zoom = 1, fx = 0.5, fy = 0.5, alpha = 1 } = {}) {
  const im = images[key];
  const scale = Math.max(w / im.width, h / im.height) * zoom;
  c.save();
  c.globalAlpha *= alpha;
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.drawImage(
    im,
    x + (w - im.width * scale) * fx,
    y + (h - im.height * scale) * fy,
    im.width * scale,
    im.height * scale,
  );
  c.restore();
}
function fade(y, h, reverse = false) {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, reverse ? PAPER : 'rgba(242,240,233,0)');
  g.addColorStop(1, reverse ? 'rgba(242,240,233,0)' : PAPER);
  c.fillStyle = g;
  c.fillRect(0, y, WIDTH, h);
}
function bubbles(t) {
  c.save();
  c.globalAlpha = 0.15;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  for (const p of particles) {
    const y = ((((p.y - t * p.v) % (HEIGHT + 80)) + HEIGHT + 80) % (HEIGHT + 80)) - 40;
    const x = p.x + Math.sin(t * 0.5 + p.p) * 18;
    c.beginPath();
    c.arc(x, y, p.r, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}
function card(item, x, y, w = 140, h = 208, { highlight = false, alpha = 1, flip = 1 } = {}) {
  c.save();
  c.globalAlpha *= alpha;
  c.translate(x + w / 2, y + h / 2);
  c.scale(Math.max(0.025, Math.abs(flip)), 1);
  c.shadowColor = 'rgba(0,0,0,.12)';
  c.shadowBlur = 14;
  c.shadowOffsetY = 9;
  c.fillStyle = flip < 0 ? INK : '#fcfbf6';
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, 5);
  c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = highlight ? RED : INK;
  c.lineWidth = highlight ? 5 : 2;
  c.stroke();
  if (flip >= 0) {
    const color = item.red ? RED : INK;
    text(item.rank, -w / 2 + 14, -h / 2 + 32, 40, { font: NUM, color, critical: false });
    text(item.suit, 0, 15, 66, {
      align: 'center',
      font: '"Segoe UI Symbol", serif',
      color,
      critical: false,
    });
    c.rotate(Math.PI);
    text(item.rank, -w / 2 + 14, -h / 2 + 27, 30, { font: NUM, color, critical: false });
  } else {
    text('A/P', 0, 0, 34, { align: 'center', color: PAPER, font: SERIF, critical: false });
  }
  c.restore();
}
export const CARD_LAYOUT = { x: 82, width: 140, gap: 22, count: 5, height: 208 };
function hand(cards, y, u, highlights = []) {
  cards.forEach((item, i) => {
    const p = ease((u - i * 0.14) / 0.48);
    card(item, 82 + i * 162, y + 55 * (1 - p), 140, 208, {
      alpha: p,
      flip: Math.cos((1 - p) * Math.PI),
      highlight: highlights.includes(item.id),
    });
  });
}
function can(x, y, w, h, open = false, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = open ? INK : PAPER;
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.beginPath();
  c.roundRect(x, y, w, h, w * 0.18);
  c.fill();
  c.stroke();
  rect(x + w * 0.3, y - 12, w * 0.4, 12);
  line(x + 7, y + h * 0.19, x + w - 7, y + h * 0.19, 1, open ? PAPER : INK);
  text('AIR', x + w / 2, y + h * 0.59, w * 0.24, {
    align: 'center',
    font: NUM,
    color: open ? PAPER : INK,
    critical: false,
  });
  c.restore();
}
function ring(x, y, r, p, color = RED) {
  c.strokeStyle = '#c5c1b6';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = 13;
  c.beginPath();
  c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(p));
  c.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i * Math.PI) / 30;
    line(
      x + Math.cos(a) * (r + 20),
      y + Math.sin(a) * (r + 20),
      x + Math.cos(a) * (r + (i % 5 ? 29 : 39)),
      y + Math.sin(a) * (r + (i % 5 ? 29 : 39)),
      i % 5 ? 1 : 2,
      '#9a978e',
    );
  }
}
function caption(t) {
  const s = getCaptions(lang).find(([a, b]) => t >= a && t < b)?.[2] ?? '';
  c.font = '600 46px ' + SANS;
  const words = en ? s.split(' ') : Array.from(s);
  const rows = [];
  let row = '';
  for (const word of words) {
    const next = row + (en && row ? ' ' : '') + word;
    if (c.measureText(next).width > 750 && row) {
      rows.push(row);
      row = word;
    } else row = next;
  }
  if (row) rows.push(row);
  const h = rows.length * 58 + 24,
    y = 1510 - h;
  rect(72, y, 810, h);
  rows.forEach((s, i) => center(s, y + 41 + i * 58, 46, { color: PAPER, max: 750 }));
}
function frame(t, scene) {
  line(82, 270, 872, 270, 2, '#b7b3a9');
  text(String(SCENES.indexOf(scene) + 1).padStart(2, '0') + ' / 08', 872, 228, 28, {
    align: 'right',
    font: NUM,
    color: GRAY,
    max: 140,
  });
  line(82, 1585, 872, 1585, 2, '#c5c1b7');
  rect(82, 1583, (790 * t) / DURATION, 4, RED);
  text('AIR POKER   /   A GAME OF NERVE', 82, 1632, 24, {
    font: NUM,
    color: GRAY,
    critical: false,
  });
  text('A / P', 920, 1770, 68, { font: SERIF, align: 'center', alpha: 0.22, critical: false });
}
const draw = {
  hook(u, t) {
    art('defeat', 0, 295, 1080, 580, { zoom: 1.12 + u * 0.018, fx: 0.42, fy: 0.3 });
    fade(730, 170);
    rect(0, 295, 1080, 7);
    line(0, 875, 1080, 875, 5);
    label(copy('空气扑克  /  一场呼吸的赌局', 'AIR POKER  /  THE STAKES'));
    center(copy('筹码', 'YOUR CHIPS.'), 970, en ? 109 : 155, {
      font: en ? NUM : SERIF,
      weight: 900,
    });
    const p = ease((u - 0.12) / 0.4);
    center(copy('就是呼吸', 'YOUR BREATH.'), 1145 + 30 * (1 - p), en ? 108 : 154, {
      font: en ? NUM : SERIF,
      color: RED,
      weight: 900,
      alpha: p,
    });
    const a = ease((u - 0.6) / 0.4);
    line(90, 1288, 860, 1288, 2, INK);
    center(copy('你敢押上下一口气吗？', 'HOW MUCH WOULD YOU RISK?'), 1336, 38, {
      font: en ? NUM : SANS,
      alpha: a,
    });
    bubbles(t);
  },
  air(u, t) {
    label(copy('01  /  空气，就是你的筹码', '01  /  EVERY CAN COUNTS'));
    center(copy('每人', 'YOU START WITH'), 360, en ? 58 : 54, { font: en ? NUM : SERIF });
    center('25', 540, 260, { font: NUM, weight: 700 });
    text('AIR', 810, 607, 42, { font: NUM, align: 'right', max: 100 });
    for (let i = 0; i < 24; i++)
      can(
        98 + (i % 8) * 96,
        735 + Math.floor(i / 8) * 139,
        56,
        104,
        false,
        ease((u - i * 0.025) / 0.35),
      );
    rect(82, 1160, 790, 180, '#e6e3da');
    can(112, 1200, 57, 106, true);
    text(copy('1 罐供气', '1 OPEN'), 205, 1212, 50, { font: en ? NUM : SANS, max: 620 });
    text(copy('24 罐未开储备，可下注', '24 SEALED. AVAILABLE TO BET.'), 205, 1290, 38, {
      font: en ? NUM : SANS,
      max: 625,
    });
    bubbles(t);
  },
  build(u) {
    label(copy('02  /  牌不是发的，是你组的', '02  /  BUILD IT YOURSELF'));
    center(copy('目标点数', 'YOUR TARGET'), 355, en ? 54 : 56);
    center('24', 530, 235, { font: NUM });
    hand(facts.lower, 737, u - 0.16);
    center('4 + 4 + 4 + 5 + 7 = 24', 1048, 58, { font: NUM, alpha: ease((u - 0.95) / 0.4) });
    pill(copy('三条  /  THREE OF A KIND', 'THREE OF A KIND'), 1137, 790, INK, 42);
    center(copy('5 张不同、未使用的实体牌', '5 DISTINCT, UNUSED CARDS'), 1290, 36, {
      color: GRAY,
      font: en ? NUM : SANS,
    });
  },
  calamity(u) {
    label(copy('03  /  同一张牌，双重代价', '03  /  SAME CARD. EXTRA COST.'));
    center(copy('撞牌 → 灾厄', 'OVERLAP → CALAMITY'), 360, en ? 67 : 97, {
      font: en ? NUM : SERIF,
      color: RED,
      weight: 900,
    });
    text(copy('四条 · 目标 24', 'FOUR OF A KIND · TARGET 24'), 82, 467, 35, {
      font: en ? NUM : SANS,
    });
    const hi = u > 0.9 ? facts.overlap : [];
    hand(facts.upper, 510, u, hi);
    hand(facts.lower, 842, u - 0.24, hi);
    if (u > 0.9) {
      for (let i = 0; i < 3; i++) {
        const x = 152 + i * 162;
        line(x, 724, x, 830, 4, RED);
      }
      rect(85, 755, 465, 44, PAPER);
      text(copy('相同点数 ＋ 相同花色', 'SAME RANK + SAME SUIT'), 318, 778, 26, {
        color: RED,
        align: 'center',
        max: 460,
      });
    }
    text(copy('三条 · 目标 24', 'THREE OF A KIND · TARGET 24'), 82, 1094, 35, {
      font: en ? NUM : SANS,
    });
    if (u < 3) {
      pill(
        copy('有效成手 + 实体重叠 + 分出胜负', 'VALID HANDS + SHARED CARDS + A WINNER'),
        1175,
        790,
        INK,
        en ? 30 : 34,
      );
      center(copy('三个条件都满足，才触发', 'ALL THREE CONDITIONS MUST HOLD'), 1304, 31, {
        color: GRAY,
        font: en ? NUM : SANS,
      });
    } else {
      const p = ease((u - 3) / 0.22);
      center('−6 AIR', 1191 + 20 * (1 - p), 113, { font: NUM, color: RED, weight: 800 });
      center(copy('败方储备 18 → 12', 'LOSER’S RESERVE 18 → 12'), 1287, 42, {
        font: en ? NUM : SANS,
      });
      center(
        copy('双方各投 6 · 败方原剩 18 · 规则示意', '6 BET EACH · 18 LEFT · RULE EXAMPLE'),
        1351,
        29,
        { color: GRAY, font: en ? NUM : SANS },
      );
    }
  },
  twist(u, t) {
    label(copy('04  /  现在，换个问题', '04  /  THE REAL QUESTION'));
    art('defeat', 0, 328, 1080, 510, { zoom: 1.18 + u * 0.025, fy: 0.22, fx: 0.5 });
    rect(0, 328, 1080, 5);
    rect(0, 833, 1080, 5);
    center(copy('赢一轮', 'WIN A HAND.'), 970, en ? 112 : 145, {
      font: en ? NUM : SERIF,
      weight: 900,
    });
    center(copy('≠', 'STILL LOSE.'), en ? 1135 : 1125, en ? 112 : 158, {
      font: NUM,
      color: RED,
      weight: 800,
    });
    if (!en) center('赢整局', 1288, 145, { font: SERIF, weight: 900 });
    bubbles(t);
  },
  endurance(u, t) {
    label(copy('05  /  把气，留到最后', '05  /  SAVE YOUR LAST BREATH'));
    center(copy('五轮之后', 'AFTER FIVE ROUNDS'), 363, en ? 70 : 100, {
      font: en ? NUM : SERIF,
      weight: 900,
    });
    for (let i = 0; i < 5; i++) {
      const x = 92 + i * 158;
      rect(x, 463, 134, 85, u > i * 0.12 ? INK : '#ccc8bc');
      text('0' + (i + 1), x + 67, 506, 45, { align: 'center', font: NUM, color: PAPER });
    }
    ring(CX, 879, 234, 1 - clamp(u / 3.6));
    center(copy('耐息', 'SURVIVE'), 830, en ? 102 : 132, { font: en ? NUM : SERIF, weight: 900 });
    center('10 SEC', 961, 68, { font: NUM, color: RED });
    center(copy('供气耗尽后的缺氧宽限', 'GRACE AFTER AIR RUNS OUT'), 1191, 39, {
      font: en ? NUM : SANS,
    });
    center(copy('数字版规则 · 时间压缩示意', 'DIGITAL RULES · TIME COMPRESSED'), 1280, 31, {
      font: en ? NUM : SANS,
      color: GRAY,
    });
    bubbles(t);
  },
  gameplay(u) {
    label(copy('06  /  真能玩，现在就能玩', '06  /  THIS IS A REAL GAME'));
    center(copy('打开浏览器，入局。', 'OPEN. PLAY. SURVIVE.'), 353, en ? 67 : 76, {
      font: en ? NUM : SERIF,
      weight: 900,
    });
    const key = u < 1.75 ? 'build' : 'showdown',
      im = images[key];
    const sourceY = key === 'build' ? 480 : 340,
      sourceHeight = key === 'build' ? (en ? 1050 : 980) : 850,
      sourceWidth = im.width - 48;
    const h = 860,
      w = (h * sourceWidth) / sourceHeight,
      x = CX - w / 2,
      y = 440;
    c.save();
    c.shadowColor = 'rgba(0,0,0,.16)';
    c.shadowBlur = 30;
    c.shadowOffsetY = 15;
    rect(x - 9, y - 9, w + 18, h + 18);
    c.restore();
    c.drawImage(im, 24, sourceY, sourceWidth, sourceHeight, x, y, w, h);
    rect(x, y - 9, w * clamp((u % 1.75) / 1.75), 5, RED);
    center(copy('真实手机界面 · 截图展示', 'REAL MOBILE UI · STILL CAPTURES'), 1350, 27, {
      font: en ? NUM : SANS,
      color: GRAY,
    });
  },
  cta(u, t) {
    label(copy('空气扑克  /  AIR POKER', 'AIR POKER  /  PLAY IN YOUR BROWSER'));
    // Two separated crops retain both faces in a portrait composition.
    art('intro', 72, 301, 390, 420, { fx: 0.03, fy: 0.26, zoom: 2.3 });
    art('intro', 482, 301, 400, 420, { fx: 0.97, fy: 0.26, zoom: 2.3 });
    line(472, 301, 472, 721, 8);
    fade(624, 127);
    center(copy('空气扑克', 'AIR POKER'), 826, en ? 123 : 151, {
      font: en ? NUM : SERIF,
      weight: 900,
    });
    if (!en) center('AIR POKER', 943, 54, { font: NUM });
    center(copy('加注，还是留气？', 'RAISE. OR SAVE'), en ? 1014 : 1071, en ? 86 : 77, {
      font: en ? NUM : SERIF,
      weight: 800,
    });
    if (en) center('YOUR AIR?', 1115, 104, { font: NUM, color: RED, weight: 800 });
    pill(copy('浏览器即玩  →', 'PLAY IN YOUR BROWSER  →'), 1201, 790, RED, 43);
    center('wychmod.github.io/air-poker/', 1332, 42, { font: NUM });
    center(
      copy('单人策略 · 无需账号 · 中 / EN', 'SOLO STRATEGY · NO ACCOUNT · ZH / EN'),
      1401,
      29,
      { font: en ? NUM : SANS, color: GRAY },
    );
    center(
      copy('改编自迫稔雄《噬谎者》第 40–43 卷', 'Inspired by Toshio Sako’s Usogui, vols. 40–43'),
      1461,
      en ? 28 : 29,
      { color: GRAY },
    );
    center(
      copy('「空气扑克」篇 · 非商用爱好者项目', 'Air Poker arc · Noncommercial fan project'),
      1506,
      27,
      { color: GRAY },
    );
    bubbles(t);
  },
};
export function renderAt(seconds, { cover = false } = {}) {
  const t = clamp(Number(seconds) || 0, 0, DURATION - 1 / 300),
    scene = sceneAt(t),
    u = t - scene.start;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  textBounds = [];
  rect(0, 0, WIDTH, HEIGHT, PAPER);
  if (cover) {
    draw.hook(2, 1);
    pill(copy('空气扑克  /  浏览器即玩', 'AIR POKER  /  PLAY IN YOUR BROWSER'), 1430, 790, INK, 35);
  } else {
    draw[scene.id](u, t);
    frame(t, scene);
    if (scene.id !== 'cta') caption(t);
    if (scene.start > 0 && u < 0.2) {
      const x = -200 + 1500 * ease(u / 0.2);
      c.save();
      c.beginPath();
      c.moveTo(x, 280);
      c.lineTo(x + 80, 280);
      c.lineTo(x - 130, 1540);
      c.lineTo(x - 210, 1540);
      c.closePath();
      c.fillStyle = INK;
      c.fill();
      c.restore();
    }
  }
  c.globalAlpha = 0.24;
  c.drawImage(texture, 0, 0, WIDTH, HEIGHT);
  c.globalAlpha = 1;
  return { time: t, scene: scene.id, textBounds };
}
export const ready = (async () => {
  const paths = {
    intro:
      '../../assets/generated/air-poker-v1/usogui-page-assets/manga-introduction-background.png',
    defeat: '../../assets/generated/air-poker-v2/defeat.png',
    build: '../../output/promo/portrait/' + lang + '/captures/build.png',
    showdown: '../../output/promo/portrait/' + lang + '/captures/showdown.png',
  };
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => {
      const im = new Image();
      im.src = path;
      await im.decode();
      images[key] = im;
    }),
  );
  const response = await fetch('../../output/promo/facts.json');
  if (!response.ok) throw new Error('Run promo:portrait:prepare first');
  facts = await response.json();
  await document.fonts.ready;
  renderAt(0);
  return true;
})();
globalThis.promo = {
  ready,
  renderAt,
  duration: DURATION,
  scenes: SCENES,
  lang,
  safe: SAFE,
  cardLayout: CARD_LAYOUT,
};

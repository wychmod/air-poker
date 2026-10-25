import { WIDTH, HEIGHT, DURATION, SCENES, CAPTIONS, sceneAt } from './timeline.js';
const canvas = document.querySelector('#film');
canvas.width = WIDTH;
canvas.height = HEIGHT;
const c = canvas.getContext('2d', { alpha: false });
const PAPER = '#f2f0e9',
  INK = '#161616',
  RED = '#8d2429',
  MUTED = '#66645e';
const SERIF = '"SimSun", "Songti SC", "Noto Serif CJK SC", serif';
const SANS = '"Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const NUM = '"Bahnschrift", "DIN Alternate", sans-serif';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (v) => 1 - (1 - clamp(v)) ** 3;
const mix = (a, b, t) => a + (b - a) * t;
const images = {};
let facts;
let seed = 81;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const particles = Array.from({ length: 44 }, () => ({
  x: rand() * 1920,
  y: rand() * 1080,
  r: 2 + rand() * 12,
  v: 8 + rand() * 22,
  p: rand() * 6.28,
}));
const texture = document.createElement('canvas');
texture.width = 480;
texture.height = 270;
const tc = texture.getContext('2d');
for (let i = 0; i < 15000; i++) {
  tc.fillStyle = 'rgba(30,25,20,' + rand() * 0.06 + ')';
  tc.fillRect(rand() * 480, rand() * 270, 1, 1);
}
function text(
  s,
  x,
  y,
  size = 48,
  { color = INK, font = SANS, weight = 500, align = 'left', alpha = 1 } = {},
) {
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = color;
  c.font = weight + ' ' + size + 'px ' + font;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.fillText(s, x, y);
  c.restore();
}
function line(x1, y1, x2, y2, width = 2, color = INK) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}
function rect(x, y, w, h, fill = INK) {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
}
function pill(s, x, y, w = 240, color = INK) {
  rect(x, y, w, 48, color);
  text(s, x + w / 2, y + 24, 22, { color: PAPER, align: 'center', weight: 700 });
}
function title(s, kicker, u) {
  text(kicker, 140, 184, 25, { font: NUM, color: MUTED });
  text(s, 140, 276 + 24 * (1 - ease(u / 0.55)), 82, {
    font: SERIF,
    weight: 900,
    alpha: ease(u / 0.35),
  });
}
function art(key, x, y, w, h, { zoom = 1, fx = 0.5, fy = 0.5, alpha = 1 } = {}) {
  const im = images[key];
  if (!im) return;
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
function paperFade(x, y, w, h, direction = 'right') {
  const g = c.createLinearGradient(
    x,
    y,
    direction === 'right' ? x + w : x,
    direction === 'right' ? y : y + h,
  );
  g.addColorStop(0, PAPER);
  g.addColorStop(0.5, 'rgba(242,240,233,0)');
  g.addColorStop(1, 'rgba(242,240,233,0)');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
}
function bubbles(t, opacity = 0.22) {
  c.save();
  c.strokeStyle = INK;
  c.lineWidth = 1.2;
  c.globalAlpha = opacity;
  for (const p of particles) {
    const x = p.x + Math.sin(t * 0.6 + p.p) * 16;
    const y = ((((p.y - t * p.v) % 1130) + 1130) % 1130) - 25;
    c.beginPath();
    c.arc(x, y, p.r, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(x - p.r * 0.2, y - p.r * 0.15, p.r * 0.65, 3.6, 4.8);
    c.stroke();
  }
  c.restore();
}
function ring(x, y, r, progress, t, color = INK) {
  c.save();
  c.lineWidth = 3;
  c.strokeStyle = '#c5c2b8';
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 10;
  c.strokeStyle = color;
  c.beginPath();
  c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(progress));
  c.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i * Math.PI) / 30;
    c.strokeStyle = i % 5 === 0 ? INK : '#aaa79e';
    c.lineWidth = i % 5 === 0 ? 2 : 1;
    line(
      x + Math.cos(a) * (r + 17),
      y + Math.sin(a) * (r + 17),
      x + Math.cos(a) * (r + (i % 5 === 0 ? 31 : 23)),
      y + Math.sin(a) * (r + (i % 5 === 0 ? 31 : 23)),
      c.lineWidth,
      c.strokeStyle,
    );
  }
  c.restore();
}
function card(
  item,
  x,
  y,
  w = 180,
  h = 250,
  { rotation = 0, back = false, muted = false, highlight = false, alpha = 1 } = {},
) {
  c.save();
  c.globalAlpha *= alpha;
  c.translate(x + w / 2, y + h / 2);
  c.rotate(rotation);
  c.shadowColor = 'rgba(0,0,0,0.13)';
  c.shadowBlur = 18;
  c.shadowOffsetY = 9;
  c.fillStyle = back ? INK : '#faf9f4';
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, 5);
  c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = highlight ? RED : INK;
  c.lineWidth = highlight ? 5 : 1.7;
  c.stroke();
  if (back) {
    c.save();
    c.beginPath();
    c.rect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16);
    c.clip();
    for (let k = -h; k < w + h; k += 15) {
      line(-w / 2 + k, -h / 2, -w / 2 + k - h, h / 2, 1, '#575754');
    }
    c.restore();
    text('A/P', 0, 0, w * 0.24, { align: 'center', font: SERIF, color: PAPER });
  } else {
    const color = muted ? '#a39e93' : item.red ? RED : INK;
    text(item.rank, -w / 2 + 16, -h / 2 + 34, w * 0.23, { color, font: NUM, weight: 600 });
    text(item.suit, -w / 2 + 16, -h / 2 + 66, w * 0.16, { color });
    text(item.suit, 0, 13, w * 0.47, { color, align: 'center', font: '"Segoe UI Symbol", serif' });
    c.save();
    c.rotate(Math.PI);
    text(item.rank, -w / 2 + 16, -h / 2 + 34, w * 0.23, { color, font: NUM, weight: 600 });
    c.restore();
  }
  c.restore();
}
function hand(cards, x, y, w, gap, u, highlight = []) {
  cards.forEach((item, i) => {
    const a = ease((u - i * 0.14) / 0.52);
    card(item, x + i * (w + gap), y + (1 - a) * 70, w, w * 1.36, {
      alpha: a,
      highlight: highlight.includes(item.id),
    });
  });
}
function can(x, y, w, h, open = false, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = open ? INK : PAPER;
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.beginPath();
  c.roundRect(x, y, w, h, Math.min(w * 0.22, 16));
  c.fill();
  c.stroke();
  rect(x + w * 0.3, y - 9, w * 0.4, 9, INK);
  line(x + 5, y + h * 0.2, x + w - 5, y + h * 0.2, 1, open ? PAPER : INK);
  text('AIR', x + w / 2, y + h * 0.56, w * 0.24, {
    font: NUM,
    align: 'center',
    color: open ? PAPER : INK,
  });
  c.restore();
}
function note(s, x = 140, y = 887, size = 25) {
  text(s, x, y, size, { color: MUTED });
}
function hero(t) {
  art('intro', 0, 100, 1920, 850, { zoom: 1 + 0.012 * Math.sin(t / 6), alpha: 0.86 });
  const g = c.createLinearGradient(0, 600, 0, 950);
  g.addColorStop(0, 'rgba(242,240,233,0)');
  g.addColorStop(1, PAPER);
  c.fillStyle = g;
  c.fillRect(0, 600, 1920, 360);
  c.save();
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(960, 813, 600, 87, 0, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.ellipse(960, 823, 630, 102, 0, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}
function chrome(t, s) {
  line(90, 113, 1830, 113, 1, '#aca89e');
  text('A / P', 95, 75, 32, { font: SERIF, weight: 800 });
  text('AIR POKER   /   你下注的，是下一口空气。', 230, 76, 20, { color: MUTED });
  text(String(SCENES.indexOf(s) + 1).padStart(2, '0') + ' / 12', 1825, 76, 23, {
    font: NUM,
    align: 'right',
  });
  line(90, 1030, 1830, 1030, 1, '#b8b4aa');
  rect(90, 1028, 1740 * clamp(t / DURATION), 3, RED);
  text('空 气 扑 克', 95, 1054, 17, { color: MUTED });
  text('A GAME OF AIR. A TEST OF NERVE.', 1825, 1054, 17, {
    align: 'right',
    font: NUM,
    color: MUTED,
  });
}
const draw = {
  hook(u, t) {
    art('defeat', 740, 150, 1120, 745, { zoom: 1.13 + u * 0.017, fx: 0.4 });
    paperFade(675, 150, 450, 745);
    text('这局扑克', 140, 360, 134, { font: SERIF, weight: 900 });
    text('赌的是', 150, 535, 90, { font: SERIF, weight: 900, alpha: ease((u - 0.65) / 0.4) });
    text('呼吸', 147, 715 + 35 * (1 - ease((u - 1.5) / 0.5)), 166, {
      font: SERIF,
      weight: 900,
      color: RED,
      alpha: ease((u - 1.5) / 0.5),
    });
    pill('YOUR NEXT BREATH IS ON THE TABLE', 150, 844, 565);
    bubbles(t, 0.12);
  },
  air(u, t) {
    title('一份空气，两种用途。', '01  /  THE STAKES', u);
    for (let i = 0; i < 24; i++)
      can(
        155 + (i % 8) * 91,
        390 + Math.floor(i / 8) * 135,
        60,
        102,
        false,
        ease((u - i * 0.045) / 0.5),
      );
    text('24', 360, 837, 92, { font: NUM, align: 'center' });
    text('未开储备 · 可下注', 645, 843, 34, { align: 'center' });
    line(945, 390, 945, 870, 1, '#b5b1a7');
    can(1120, 460, 126, 215, true);
    ring(1450, 565, 140, 1 - u / 300, t);
    text('25', 1450, 550, 118, { font: NUM, align: 'center' });
    text('每人初始总量', 1450, 638, 25, { align: 'center' });
    text('1 罐正在供气', 1320, 815, 43, { align: 'center', weight: 700 });
    note('已开罐不能下注 · 每罐约 300 秒', 1090, 880, 28);
  },
  target(u, t) {
    art('intro', 0, 150, 1920, 750, { alpha: 0.18, zoom: 1.02 });
    title('先选数字。再决定命运。', '02  /  PICK A TARGET', u);
    [17, 24, 35, 42, 51].forEach((n, i) => {
      const selected = i === 1;
      const a = ease((u - i * 0.17) / 0.5);
      const x = 338 + i * 260;
      const y = 440 + Math.abs(i - 2) * 14 - (selected ? ease((u - 2) / 0.7) * 65 : 0);
      c.save();
      c.globalAlpha = a;
      rect(x, y, 220, 305, selected && u > 2 ? INK : '#faf9f4');
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.strokeRect(x, y, 220, 305);
      text('TARGET', x + 110, y + 45, 23, {
        font: NUM,
        align: 'center',
        color: selected && u > 2 ? PAPER : MUTED,
      });
      text(n, x + 110, y + 162, 102, {
        font: NUM,
        align: 'center',
        color: selected && u > 2 ? PAPER : INK,
      });
      text(selected && u > 2 ? '本轮选择' : '数字牌', x + 110, y + 263, 25, {
        align: 'center',
        color: selected && u > 2 ? PAPER : MUTED,
      });
      c.restore();
    });
    note('五张私有数字牌 · 逐轮消耗，不补牌', 140, 879, 31);
    text('规则示意', 1780, 879, 22, { align: 'right', color: MUTED });
  },
  build(u) {
    title('同一个 24，能打出什么？', '03  /  BUILD YOUR HAND', u);
    hand(facts.lower, 205, 405, 245, 60, u - 0.2);
    const a = ease((u - 1.7) / 0.6);
    text('4 + 4 + 4 + 5 + 7 = 24', 960, 803, 69, { font: NUM, align: 'center', alpha: a });
    pill('三条', 1515, 789, 190);
    note('5 张不同、未使用的实体牌 · 点数和匹配目标', 140, 889, 30);
    text('规则示意', 1780, 889, 22, { align: 'right', color: MUTED });
  },
  used(u) {
    title('强牌的代价，也在下一轮。', '04  /  EVERY CARD HAS A COST', u);
    hand(facts.lower, 150, 428, 150, 25, 2);
    c.save();
    c.translate(555, 635);
    c.rotate(-0.08);
    c.globalAlpha = ease((u - 0.4) / 0.3);
    c.strokeStyle = RED;
    c.lineWidth = 5;
    c.strokeRect(-247, -54, 494, 108);
    text('已 用 · 不 可 复 用', 0, 0, 43, { color: RED, align: 'center', weight: 700 });
    c.restore();
    line(1080, 390, 1080, 830, 1, '#b5b1a7');
    for (let suit = 0; suit < 4; suit++)
      for (let rank = 1; rank <= 13; rank++) {
        const spent = facts.lower.some((x) => x.id === rank + '-' + suit);
        const x = 1140 + (rank - 1) * 47,
          y = 430 + suit * 81;
        rect(x, y, 34, 56, spent ? RED : '#dedbd2');
        if (spent) line(x, y, x + 34, y + 56, 2, PAPER);
      }
    text('共享实体牌库', 1440, 825, 38, { align: 'center' });
    note('前轮双方有效成手中的实体牌，后续都不可再用。', 140, 888, 29);
  },
  bet(u, t) {
    title('你加的，是未来的呼吸。', '05  /  MAKE YOUR MOVE', u);
    const paid = u >= 2,
      called = u >= 3.3,
      pot = called ? 4 : paid ? 3 : 2;
    text('你的未开储备', 350, 416, 34, { align: 'center' });
    text(paid ? '22' : '23', 350, 566, 170, { font: NUM, align: 'center' });
    text('AIR', 350, 705, 36, { font: NUM, align: 'center' });
    ring(960, 570, 155, 1, t);
    text(pot, 960, 555, 142, { font: NUM, align: 'center' });
    text('底池 / AIR', 960, 650, 28, { align: 'center' });
    text('对手', 1530, 420, 34, { align: 'center' });
    for (let i = 0; i < 3; i++)
      card(null, 1400 + i * 66, 480, 120, 170, { back: true, rotation: (i - 1) * 0.09 });
    if (paid) {
      line(520, 570, 735, 570, 4, RED);
      text('+1', 625, 521, 52, { font: NUM, color: RED, align: 'center' });
    }
    if (called) {
      line(1360, 570, 1190, 570, 4, INK);
      text('跟 1', 1285, 521, 40, { align: 'center' });
    }
    ['跟注', '加注', '弃牌'].forEach((s, i) =>
      pill(s, 615 + i * 240, 794, 210, i === 1 ? RED : INK),
    );
    note('规则示意：底池 2，无需跟注，最多加 1；对手跟齐后，行动继续。', 140, 889, 26);
  },
  calamity(u) {
    title('撞牌，才是最危险的一刻。', '06  /  CALAMITY', u);
    const hi = u > 2 ? facts.overlap : [];
    text('四条 · 目标 24', 155, 358, 28, { weight: 700 });
    hand(facts.upper, 155, 393, 145, 34, u, hi);
    text('三条 · 目标 24', 155, 672, 28, { weight: 700 });
    hand(facts.lower, 155, 705, 145, 34, u - 0.5, hi);
    if (u > 2)
      for (let i = 0; i < 3; i++) {
        const x = 155 + i * 179 + 72;
        line(x, 593, x, 645, 3, RED);
        text('同实体', x, 625, 17, { align: 'center', color: RED });
      }
    line(1120, 355, 1120, 904, 1, '#b5b1a7');
    text('灾厄', 1447, 438, 118, { font: SERIF, align: 'center', color: RED, weight: 900 });
    if (u < 5.3) {
      text('有效成手', 1447, 590, 42, { align: 'center' });
      text('实体重叠', 1447, 659, 42, { align: 'center' });
      text('分出胜负', 1447, 728, 42, { align: 'center' });
    } else {
      text('−6 AIR', 1447, 600, 103, { font: NUM, align: 'center', color: RED });
      text('败方未开储备 18 → 12', 1447, 733, 36, { align: 'center' });
      text('双方各投 6 · 败方原剩 18', 1447, 797, 25, { align: 'center', color: MUTED });
    }
    text('额外烧毁 = min(败方本轮投入，剩余未开储备)', 1447, 864, 23, {
      align: 'center',
      color: MUTED,
    });
    text('规则示意 · 普通弃牌、成手失败、平局不触发灾厄', 140, 935, 22, { color: MUTED });
  },
  twist(u, t) {
    art('defeat', 90, 210, 1740, 385, { zoom: 1.1 + u * 0.025, fy: 0.24, alpha: 0.82 });
    rect(90, 210, 1740, 5);
    rect(90, 590, 1740, 5);
    text('赢牌', 470, 753, 156, { font: SERIF, align: 'center', weight: 900 });
    text('≠', 960, 750, 164, { font: NUM, align: 'center', color: RED });
    text('赢局', 1450, 753, 156, { font: SERIF, align: 'center', weight: 900 });
    text('THE POT IS NOT THE END.', 960, 883, 32, { font: NUM, align: 'center', color: MUTED });
    bubbles(t, 0.16);
  },
  endurance(u, t) {
    title('把最后一口气，留到最后。', '07  /  ENDURANCE', u);
    const progress = clamp(1 - u / 8);
    ring(1370, 590, 222, progress, t, RED);
    text('耐息', 1370, 564, 106, { font: SERIF, align: 'center', weight: 900 });
    text('AFTER ROUND 05', 1370, 655, 27, { font: NUM, align: 'center', color: MUTED });
    for (let i = 0; i < 5; i++) {
      const x = 175 + i * 163;
      rect(x, 420, 128, 110, u > i * 0.35 ? INK : '#d9d5ca');
      text('0' + (i + 1), x + 64, 476, 50, { align: 'center', font: NUM, color: PAPER });
    }
    text('供气耗尽后', 165, 645, 48, { font: SERIF });
    text('10', 165, 757, 124, { font: NUM, color: RED });
    text('秒数字版缺氧宽限', 332, 780, 38);
    note('按实际供气与存活判定胜负 · 耐息可快进', 140, 888, 29);
    text('时间压缩示意', 1370, 879, 23, { align: 'center', color: MUTED });
  },
  gameplay(u) {
    const index = Math.min(2, Math.floor(u / 2)),
      local = u - index * 2,
      key = ['build', 'showdown', 'review'][index];
    const labels = [
      ['自由构牌', '把想法', '打成一手牌。'],
      ['公开摊牌', '每次选择', '都有代价。'],
      ['完整复盘', '每一步', '都能回看。'],
    ][index];
    text('08  /  IN THE BROWSER', 140, 190, 25, { font: NUM, color: MUTED });
    text(labels[0], 140, 352, 70, { font: SERIF, weight: 900 });
    text(labels[1], 140, 510, 48);
    text(labels[2], 140, 585, 48);
    pill('真实游戏界面 · 截图运镜', 140, 756, 420);
    const x = 650,
      y = 196,
      w = 1120,
      h = 700;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.18)';
    c.shadowBlur = 30;
    c.shadowOffsetY = 16;
    rect(x, y, w, h, '#e9e6de');
    c.restore();
    // Fit the whole screenshot. A gentle frame translation never crops away any cards.
    const im = images[key],
      scale = Math.min(w / im.width, h / im.height);
    c.drawImage(
      im,
      x + (w - im.width * scale) / 2,
      y + (h - im.height * scale) / 2,
      im.width * scale,
      im.height * scale,
    );
    rect(x, y - 7, w * ease((local + 0.15) / 1.8), 4, RED);
    note('单人浏览器策略游戏 · 无需账号', 140, 888, 27);
  },
  title(u, t) {
    hero(t);
    text('空气扑克', 960, 398, 168, { font: SERIF, weight: 900, align: 'center' });
    text('AIR POKER', 960, 535, 55, { font: NUM, align: 'center' });
    line(720, 598, 1200, 598, 3);
    text('你下注的，是下一口空气。', 960, 686, 47, { align: 'center' });
    bubbles(t, 0.16);
  },
  cta(u, t) {
    hero(t);
    rect(90, 815, 1740, 195, PAPER);
    rect(430, 208, 1060, 562, 'rgba(242,240,233,0.91)');
    text('空气扑克', 960, 330, 130, { font: SERIF, weight: 900, align: 'center' });
    text('你会加注，还是留气？', 960, 478, 49, { align: 'center' });
    pill('简介链接  /  直接开局  →', 640, 565, 640, RED);
    text('wychmod.github.io/air-poker/', 960, 677, 35, { font: NUM, align: 'center' });
    text('本地单人  ·  浏览器即玩  ·  中 / EN', 960, 746, 27, { align: 'center', color: MUTED });
    text('改编自迫稔雄《噬谎者》第 40–43 卷「空气扑克」篇', 960, 867, 30, { align: 'center' });
    text('非商用爱好者项目  /  数字版规则与原作存在改编', 960, 917, 24, {
      align: 'center',
      color: MUTED,
    });
  },
};
export function renderAt(seconds, { cover = false } = {}) {
  const t = clamp(Number(seconds) || 0, 0, DURATION - 1 / 300),
    scene = sceneAt(t),
    u = t - scene.start;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  rect(0, 0, WIDTH, HEIGHT, PAPER);
  if (cover) {
    art('intro', 0, 0, 1920, 1080, { zoom: 1.02 });
    rect(395, 235, 1130, 520, 'rgba(242,240,233,0.92)');
    text('赌的是', 960, 400, 158, { font: SERIF, align: 'center', weight: 900 });
    text('呼 吸', 960, 613, 208, { font: SERIF, align: 'center', weight: 900, color: RED });
    pill('空气扑克  /  网页即玩', 670, 822, 580);
  } else {
    draw[scene.id](u, t);
    chrome(t, scene);
    const caption = CAPTIONS.find(([a, b]) => t >= a && t < b)?.[2] || '';
    if (scene.id !== 'cta') {
      c.font = '500 38px ' + SANS;
      const w = c.measureText(caption).width + 62;
      rect((1920 - w) / 2, 951, w, 58, INK);
      text(caption, 960, 980, 38, { align: 'center', color: PAPER });
    }
    // One paper-panel wipe per cut, no random flashes or frame-dependent state.
    if (scene.start > 0 && u < 0.27) {
      const p = ease(u / 0.27),
        x = mix(-150, 2070, p);
      c.save();
      c.beginPath();
      c.moveTo(x - 230, 125);
      c.lineTo(x + 15, 125);
      c.lineTo(x - 135, 1012);
      c.lineTo(x - 380, 1012);
      c.closePath();
      c.fillStyle = INK;
      c.fill();
      c.restore();
    }
  }
  c.globalAlpha = 0.32;
  c.drawImage(texture, 0, 0, 1920, 1080);
  c.globalAlpha = 1;
  return { time: t, scene: scene.id };
}
export const ready = (async () => {
  const paths = {
    intro: '../assets/generated/air-poker-v1/usogui-page-assets/manga-introduction-background.png',
    defeat: '../assets/generated/air-poker-v2/defeat.png',
    build: '../output/promo/captures/build.png',
    showdown: '../output/promo/captures/showdown.png',
    review: '../output/promo/captures/review.png',
  };
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => {
      const im = new Image();
      im.src = path;
      await im.decode();
      images[key] = im;
    }),
  );
  const r = await fetch('../output/promo/facts.json');
  if (!r.ok) throw new Error('请先运行素材准备命令');
  facts = await r.json();
  await document.fonts.ready;
  if (!document.fonts.check('20px ' + SANS)) throw new Error('Chinese font unavailable');
  renderAt(0);
  return true;
})();
// This standalone production page is separate from the game and its state.
globalThis.promo = { ready, renderAt, duration: DURATION, scenes: SCENES };

import { airTotals, isCompletedRecord } from '../game/records.js';

export const PLAY_URL = 'https://wychmod.github.io/air-poker/';
export const shareUrl = (lang) => PLAY_URL + (lang === 'en' ? 'en.html' : '');
const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
const copy = (lang, zh, en) => (lang === 'en' ? en : zh);

// Deliberately discard cards, targets, action history and record IDs from share data.
export function shareSummary(record) {
  if (!isCompletedRecord(record)) return null;
  const balanceAt = (id) => {
    const last = record.ledger.filter((entry) => entry.id < id).at(-1);
    return last ? { player: last.after.player, ai: last.after.ai } : { ...record.initialAir };
  };
  const firstRound = record.events.find((event) => event.type === 'round-started');
  const points = [{ round: 0, ...balanceAt(firstRound?.id ?? 1) }];
  for (const round of record.rounds.filter((item) => item.status === 'settled')) {
    const ended = record.events.find(
      (event) => event.type === 'round-ended' && event.round === round.number,
    );
    if (!ended) return null;
    points.push({ round: round.number, ...balanceAt(ended.id) });
  }
  const totals = airTotals(record);
  return {
    winner: record.result.winner,
    rounds: record.result.completedRounds,
    elapsedMs: record.result.elapsedMs,
    finalAir: { ...record.result.finalAir },
    burned: totals.player.burned + totals.ai.burned,
    calamities: record.rounds.filter((round) => round.settlement?.calamity).length,
    points,
  };
}

export function shareCopy(model, lang) {
  const result =
    model.winner === 'player'
      ? copy(lang, '我活到了最后。', 'I outlasted the abyss.')
      : model.winner === 'ai'
        ? copy(lang, '这一局，深渊赢了。', 'The abyss won this time.')
        : copy(lang, '最后一口气，同归。', 'One last breath. A draw.');
  return {
    title: copy(lang, '空气扑克 · 我的战报', 'Air Poker · My match'),
    text:
      result +
      copy(
        lang,
        ' 你下注的，是下一口空气。来试试空气扑克。',
        ' Your next breath is on the table. Play Air Poker.',
      ),
    url: shareUrl(lang),
    filename:
      'air-poker-' +
      (model.winner === 'player' ? 'victory' : model.winner === 'ai' ? 'defeat' : 'draw') +
      '-' +
      lang +
      '.png',
  };
}

const text = (x, y, size, value, extra = '') =>
  '<text x="' +
  x +
  '" y="' +
  y +
  '" font-size="' +
  size +
  '" ' +
  extra +
  '>' +
  xml(value) +
  '</text>';
const line = (x1, y1, x2, y2, extra = '') =>
  '<path d="M' +
  x1 +
  ' ' +
  y1 +
  'H' +
  x2 +
  '" ' +
  (y1 === y2
    ? ''
    : 'transform="rotate(' +
      (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI +
      ' ' +
      x1 +
      ' ' +
      y1 +
      ')" ') +
  extra +
  '/>';
function shell(width, height, content, lang) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    width +
    '" height="' +
    height +
    '" viewBox="0 0 ' +
    width +
    ' ' +
    height +
    '" role="img" aria-label="' +
    copy(lang, '空气扑克分享图', 'Air Poker share image') +
    '"><defs><pattern id="paper" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="#393e36" opacity=".08"/></pattern></defs><rect width="100%" height="100%" fill="#f5f3eb"/><rect width="100%" height="100%" fill="url(#paper)"/><g fill="#20251f" font-family="Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif">' +
    content +
    '</g></svg>'
  );
}
function bubbles() {
  return '<g fill="none" stroke="#6b7467" stroke-width="2" opacity=".36"><circle cx="918" cy="223" r="15"/><circle cx="955" cy="169" r="8"/><circle cx="892" cy="127" r="5"/><path d="M730 360Q800 324 870 360T1010 360M759 387Q820 351 881 387T1003 387"/></g>';
}
function chart(model, lang) {
  const left = 114,
    right = 928,
    top = 745,
    bottom = 1005;
  const max = Math.max(25, ...model.points.flatMap((p) => [p.player, p.ai]));
  const cap = Math.ceil(max / 10) * 10;
  const x = (index) => left + ((right - left) * index) / Math.max(1, model.points.length - 1);
  const y = (value) => bottom - ((bottom - top) * value) / cap;
  let content = text(
    72,
    679,
    29,
    copy(lang, '每轮结束 · 未开空气储备', 'UNOPENED AIR · AFTER EACH ROUND'),
    'font-weight="700"',
  );
  content += text(
    72,
    715,
    19,
    copy(
      lang,
      '按实际账目绘制；不含之后的耐息消耗',
      'Actual balances; excludes later endurance consumption',
    ),
    'fill="#62695e"',
  );
  for (const tick of [0, cap / 2, cap])
    content +=
      line(left, y(tick), right, y(tick), 'stroke="#c9ccbf"') + text(72, y(tick) + 7, 19, tick);
  for (const [actor, color, dash] of [
    ['ai', '#92978b', 'stroke-dasharray="9 7"'],
    ['player', '#20251f', ''],
  ]) {
    const d = model.points.map((p, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(p[actor])).join(' ');
    content +=
      '<path d="' +
      d +
      '" fill="none" stroke="' +
      color +
      '" stroke-width="5" stroke-linejoin="round" ' +
      dash +
      '/>';
    content += model.points
      .map(
        (p, i) => '<circle cx="' + x(i) + '" cy="' + y(p[actor]) + '" r="6" fill="' + color + '"/>',
      )
      .join('');
  }
  model.points.forEach((point, index) => {
    content += text(
      x(index),
      1042,
      19,
      index === 0 ? copy(lang, '开局', 'START') : 'R' + point.round,
      'text-anchor="middle"',
    );
  });
  content +=
    line(72, 1090, 117, 1090, 'stroke="#20251f" stroke-width="5"') +
    text(130, 1097, 21, copy(lang, '你', 'YOU'));
  content +=
    line(257, 1090, 302, 1090, 'stroke="#92978b" stroke-width="5" stroke-dasharray="9 7"') +
    text(315, 1097, 21, copy(lang, '对手', 'OPPONENT'));
  return content;
}

export function shareImageSvg(model, lang = 'zh') {
  const win = model.winner === 'player',
    draw = model.winner === 'tie';
  const outcome = win
    ? copy(lang, '生还', 'SURVIVED')
    : draw
      ? copy(lang, '平局', 'A DRAW')
      : copy(lang, '沉没', 'DEFEATED');
  const title = win
    ? copy(lang, '我活到了最后。', 'I held my final breath.')
    : draw
      ? copy(lang, '同一秒，最后一口气。', 'The same final second.')
      : copy(lang, '下一局，再赌一口气。', 'One more round. One more breath.');
  const c = (zh, en) => copy(lang, zh, en);
  let body = text(72, 77, 24, 'AIR POKER / MATCH REPORT', 'letter-spacing="3"');
  body += text(1008, 77, 21, '25 AIR × 2', 'text-anchor="end"');
  body += line(72, 105, 1008, 105, 'stroke="#20251f" stroke-width="3"');
  body += text(
    72,
    177,
    25,
    c('空气扑克 · 我的生存记录', 'AIR POKER · MY SURVIVAL RECORD'),
    'fill="#62695e"',
  );
  body += text(
    66,
    334,
    lang === 'en' ? 110 : 150,
    outcome,
    'font-weight="900" letter-spacing="-4"',
  );
  body += text(72, 406, lang === 'en' ? 31 : 38, title, 'font-weight="700"');
  body += text(
    72,
    454,
    23,
    c('你下注的，是下一口空气。', 'Your next breath is on the table.'),
    'fill="#62695e"',
  );
  body += bubbles();
  const mins = Math.floor(model.elapsedMs / 60000),
    secs = Math.floor(model.elapsedMs / 1000) % 60;
  const stats = [
    [c('完成轮次', 'ROUNDS'), model.rounds + ' / 5'],
    [c('重叠灾厄', 'CALAMITIES'), String(model.calamities)],
    [c('实际烧毁', 'AIR BURNED'), String(model.burned)],
  ];
  body += '<rect x="72" y="498" width="936" height="125" fill="#e8e8df"/>';
  stats.forEach(([label, value], index) => {
    const x = 96 + index * 312;
    body +=
      text(x, 536, 19, label, 'fill="#62695e"') +
      text(
        x,
        591,
        45,
        value,
        'font-weight="700"' + (index === 2 && model.burned > 0 ? ' fill="#903d38"' : ''),
      );
  });
  body += chart(model, lang);
  body += line(72, 1132, 1008, 1132, 'stroke="#20251f" stroke-width="2"');
  body += text(
    72,
    1175,
    20,
    c(
      '终局未开储备：你 ' + model.finalAir.player + ' / 对手 ' + model.finalAir.ai + ' AIR',
      'FINAL RESERVE: YOU ' + model.finalAir.player + ' / OPPONENT ' + model.finalAir.ai + ' AIR',
    ),
  );
  body += text(
    72,
    1211,
    19,
    c(
      '对局计时 ' + mins + ':' + String(secs).padStart(2, '0') + ' · 快进亦计入',
      'GAME CLOCK ' + mins + ':' + String(secs).padStart(2, '0') + ' · fast-forward counts',
    ),
    'fill="#62695e"',
  );
  body += text(72, 1285, 33, c('下一位，敢坐下吗？', 'YOUR SEAT IS WAITING.'), 'font-weight="700"');
  body += text(
    72,
    1324,
    23,
    shareUrl(lang).replace('https://', ''),
    'font-family="Courier New, monospace"',
  );
  body += text(
    72,
    1387,
    lang === 'en' ? 17 : 20,
    c(
      '改编自迫稔雄《噬谎者》第 40–43 卷「空气扑克」篇',
      'Based on Toshio Sako’s USOGUI, volumes 40–43 · Air Poker',
    ),
  );
  return shell(1080, 1440, body, lang);
}

export function shareCoverSvg(lang = 'zh') {
  const c = (zh, en) => copy(lang, zh, en);
  let body = text(64, 69, 22, 'AIR POKER / A GAME OF AIR', 'letter-spacing="3"');
  body += line(64, 94, 1136, 94, 'stroke="#20251f" stroke-width="2"');
  body += text(
    58,
    240,
    lang === 'en' ? 90 : 112,
    c('空气扑克', 'AIR POKER'),
    'font-weight="900" letter-spacing="-3"',
  );
  body += text(
    64,
    316,
    lang === 'en' ? 29 : 38,
    c('你下注的，是下一口空气。', 'Your next breath is on the table.'),
    'font-weight="700"',
  );
  body += text(
    64,
    373,
    23,
    c('数字构牌 / 隐藏信息 / 空气博弈', 'BUILD A HAND / READ THE RISK / BET YOUR AIR'),
    'fill="#62695e"',
  );
  body +=
    '<g transform="translate(895 190) rotate(12)" stroke="#20251f"><rect width="145" height="208" rx="5" fill="#20251f"/><rect x="-20" y="24" width="145" height="208" rx="5" fill="#f5f3eb" stroke-width="3"/><text x="2" y="69" fill="#20251f" stroke="none" font-size="38">A</text><text x="50" y="155" fill="#903d38" stroke="none" font-size="72" text-anchor="middle">♦</text></g>';
  body +=
    '<path d="M754 436Q912 384 1136 436M754 455Q912 404 1136 455" fill="none" stroke="#92978b" stroke-width="2"/>';
  body += text(
    64,
    485,
    25,
    c('免费浏览器游戏 · 中 / EN · 无需账号', 'FREE BROWSER GAME · 中文 / EN · NO SIGN-UP'),
    'font-weight="700"',
  );
  body += text(
    64,
    529,
    22,
    shareUrl(lang).replace('https://', ''),
    'font-family="Courier New, monospace"',
  );
  body += text(
    64,
    591,
    lang === 'en' ? 18 : 21,
    c(
      '游戏改编自迫稔雄《噬谎者》第 40–43 卷「空气扑克」篇',
      'Based on Toshio Sako’s USOGUI, volumes 40–43 · Air Poker',
    ),
    'fill="#62695e"',
  );
  return shell(1200, 630, body, lang);
}

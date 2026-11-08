import { airTotals, isCompletedRecord } from '../game/records.js';

export const PLAY_URL = 'https://wychmod.github.io/air-poker/';
export const shareUrl = (lang) => PLAY_URL + (lang === 'en' ? 'en.html' : '');
const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
const copy = (lang, zh, en) => (lang === 'en' ? en : zh);

const playerEntries = (record) =>
  (record.rounds ?? []).flatMap((round) =>
    (round.actions ?? [])
      .filter((action) => action.actor === 'player')
      .map((action) => ({ round, action })),
  );

// Only the player's own public actions and final hand reach the comic frames.
// Opponent cards and targets, full histories and record IDs are discarded.
export function comicFacts(record) {
  const ranked = [...playerEntries(record)].sort(
    (a, b) => b.action.paid - a.action.paid || b.action.raised - a.action.raised,
  );
  const biggest =
    ranked.find(
      ({ action }) =>
        ['call', 'raise', 'all-in'].includes(action.action) &&
        (action.paid > 0 || action.action === 'all-in'),
    ) ?? null;
  const turning =
    ranked
      .filter(({ action }) => ['fold', 'all-in', 'call'].includes(action.action))
      .filter(({ action }) => !biggest || action !== biggest.action)[0] ?? null;
  const rounds = record.rounds ?? [];
  const finalRound =
    rounds.filter((round) => round.status === 'settled').at(-1) ?? rounds.at(-1) ?? null;
  const lastAttempt = finalRound?.attempts?.at(-1) ?? null;
  const hand = lastAttempt?.player?.hand ?? [];
  return {
    wager: biggest
      ? {
          round: biggest.round.number,
          action: biggest.action.action,
          paid: biggest.action.paid ?? 0,
          raised: biggest.action.raised ?? 0,
          target: biggest.round.targets?.player?.value ?? null,
          pot: biggest.action.pot ?? null,
        }
      : null,
    turn: turning
      ? {
          round: turning.round.number,
          action: turning.action.action,
          paid: turning.action.paid ?? 0,
          toCall: turning.action.toCall ?? 0,
        }
      : null,
    final: {
      winner: record.result.winner,
      round: finalRound?.number ?? null,
      settlement: finalRound?.settlement?.winner ?? null,
      hand: hand.map((card) => ({ rank: card.rank, suit: card.suit })),
      failed: Boolean(lastAttempt?.player && lastAttempt.player.valid === false),
      finalAir: { ...record.result.finalAir },
    },
  };
}

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
    comic: comicFacts(record),
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
const pad2 = (value) => String(value).padStart(2, '0');
const actionText = (action, lang) => {
  if (action === 'fold') return copy(lang, '弃牌', 'FOLD');
  if (action === 'all-in') return copy(lang, '全押', 'ALL-IN');
  if (action === 'raise') return copy(lang, '加注', 'RAISE');
  if (action === 'call') return copy(lang, '跟注', 'CALL');
  return copy(lang, '过牌', 'CHECK');
};
const settlementText = (winner, lang) =>
  winner === 'player'
    ? copy(lang, '这一轮归你', 'ROUND TO YOU')
    : winner === 'ai'
      ? copy(lang, '这一轮归对手', 'ROUND TO OPPONENT')
      : winner === 'tie'
        ? copy(lang, '这一轮平手', 'ROUND TIED')
        : copy(lang, '对局结束', 'MATCH ENDED');

function stamp(x, y, label, color, width) {
  return (
    '<g transform="rotate(-3 ' +
    x +
    ' ' +
    y +
    ')"><rect x="' +
    (x - width / 2) +
    '" y="' +
    (y - 16) +
    '" width="' +
    width +
    '" height="32" fill="none" stroke="' +
    color +
    '" stroke-width="3"/><text x="' +
    x +
    '" y="' +
    (y + 7) +
    '" fill="' +
    color +
    '" font-size="14" font-weight="700" letter-spacing="1.4" text-anchor="middle">' +
    xml(label) +
    '</text></g>'
  );
}

const widthOfPanel = 304;

function comicHand(hand, x, y, lang, failed = false) {
  if (!hand.length)
    return text(
      x + widthOfPanel / 2,
      y + 30,
      14,
      failed
        ? copy(lang, '最终成手失败', 'FINAL HAND FAILED')
        : copy(lang, '未记录最终成手', 'NO FINAL HAND RECORDED'),
      'text-anchor="middle" fill="#c9c9c0"',
    );
  const cardWidth = 34,
    cardHeight = 50,
    gap = 8,
    start = x + (widthOfPanel - (cardWidth * 5 + gap * 4)) / 2;
  return hand
    .slice(0, 5)
    .map((card, index) => {
      const cx = start + index * (cardWidth + gap);
      return (
        '<rect x="' +
        cx +
        '" y="' +
        y +
        '" width="' +
        cardWidth +
        '" height="' +
        cardHeight +
        '" rx="3" fill="#f5f3eb" stroke="#f5f3eb" stroke-width="2"/>' +
        text(
          cx + cardWidth / 2,
          y + 20,
          16,
          card.rank,
          'text-anchor="middle" font-weight="700" fill="#20251f"',
        ) +
        text(cx + cardWidth / 2, y + 40, 17, card.suit, 'text-anchor="middle" fill="#20251f"')
      );
    })
    .join('');
}

function comicStrip(model, lang) {
  const comic = model.comic ?? {};
  const final = comic.final ?? {
    winner: model.winner,
    round: null,
    settlement: null,
    hand: [],
    failed: false,
    finalAir: model.finalAir ?? { player: 0, ai: 0 },
  };
  const c = (zh, en) => copy(lang, zh, en);
  const top = 600,
    height = 282,
    gap = 12,
    left = 72;
  const x = (index) => left + index * (widthOfPanel + gap);
  const ink = '#20251f',
    paper = '#f8f7f2',
    muted = '#62695e';
  let content =
    '<defs>' +
    [0, 1, 2]
      .map(
        (index) =>
          '<clipPath id="comicClip' +
          index +
          '"><rect x="' +
          x(index) +
          '" y="' +
          top +
          '" width="' +
          widthOfPanel +
          '" height="' +
          height +
          '"/></clipPath>',
      )
      .join('') +
    '</defs>';
  content += text(
    72,
    578,
    18,
    c('终局三格 · 只取本局事实', 'THREE FRAMES · RECORDED ONLY'),
    'font-weight="700" letter-spacing="2"',
  );
  content += text(
    1008,
    578,
    13,
    'AFTER THE WATER / 终局之后',
    'text-anchor="end" fill="#62695e" letter-spacing="1"',
  );

  const frame = (index, kicker, dark, body) =>
    '<rect x="' +
    (x(index) + 6) +
    '" y="' +
    (top + 8) +
    '" width="' +
    widthOfPanel +
    '" height="' +
    height +
    '" fill="#20251f" opacity=".12"/>' +
    '<rect x="' +
    x(index) +
    '" y="' +
    top +
    '" width="' +
    widthOfPanel +
    '" height="' +
    height +
    '" fill="' +
    (dark ? ink : paper) +
    '" stroke="' +
    ink +
    '" stroke-width="4"/>' +
    '<g fill="none" stroke="' +
    (dark ? '#8d9388' : '#aeb2a7') +
    '" stroke-width="1.5" opacity=".42"><path d="M' +
    (x(index) + 214) +
    ' ' +
    (top + 16) +
    'h74M' +
    (x(index) + 238) +
    ' ' +
    (top + 25) +
    'h50M' +
    (x(index) + 254) +
    ' ' +
    (top + 34) +
    'h29"/></g>' +
    text(
      x(index) + widthOfPanel - 16,
      top + 46,
      30,
      pad2(index + 1),
      'text-anchor="end" font-weight="700" fill="' + (dark ? '#4d534b' : '#d9d8ce') + '"',
    ) +
    text(
      x(index) + 18,
      top + 34,
      13,
      kicker,
      'font-weight="700" letter-spacing="1.4" fill="' + (dark ? '#b9beb2' : muted) + '"',
    ) +
    '<g clip-path="url(#comicClip' +
    index +
    ')">' +
    body +
    '</g>';

  const wager = comic.wager;
  const wagerBody = wager
    ? text(
        x(0) + 18,
        top + 69,
        20,
        'R' + pad2(wager.round) + ' · ' + actionText(wager.action, lang),
        'font-weight="700"',
      ) +
      text(
        x(0) + 18,
        top + 144,
        wager.paid > 0 ? 62 : 38,
        wager.paid > 0 ? wager.paid : actionText(wager.action, lang),
        'font-weight="700" letter-spacing="-2"',
      ) +
      text(
        x(0) + 18,
        top + 172,
        12,
        c('已投入空气', 'AIR COMMITTED'),
        'font-weight="700" letter-spacing="1.3" fill="#62695e"',
      ) +
      line(x(0) + 18, top + 191, x(0) + widthOfPanel - 18, top + 191, 'stroke="#c9cac0"') +
      text(
        x(0) + 18,
        top + 220,
        14,
        c('目标 ', 'TARGET ') +
          (wager.target ?? '—') +
          c(' · 当时底池 ', ' · POT THEN ') +
          (wager.pot ?? '—'),
        'fill="#555a53"',
      ) +
      text(
        x(0) + 18,
        top + 252,
        11,
        c('公开行动', 'PUBLIC ACTION'),
        'font-weight="700" letter-spacing="1.2" fill="#8a8f85"',
      )
    : text(x(0) + 18, top + 69, 18, c('没有记录到下注', 'NO RECORDED WAGER'), 'font-weight="700"') +
      text(x(0) + 18, top + 144, 54, '—', 'font-weight="700"') +
      text(
        x(0) + 18,
        top + 190,
        13,
        c('本局没有公开下注', 'NO PUBLIC BET IN THIS MATCH'),
        'fill="#555a53"',
      ) +
      text(
        x(0) + 18,
        top + 252,
        11,
        c('如实留白', 'NO INVENTED FACT'),
        'font-weight="700" letter-spacing="1.2" fill="#8a8f85"',
      );

  const turn = comic.turn;
  const turnBody = turn
    ? text(
        x(1) + 18,
        top + 69,
        20,
        'R' + pad2(turn.round) + ' · ' + c('决定', 'DECISION'),
        'font-weight="700"',
      ) +
      text(
        x(1) + 18,
        top + 142,
        42,
        actionText(turn.action, lang),
        'font-weight="700" letter-spacing="-1"',
      ) +
      text(
        x(1) + 18,
        top + 178,
        14,
        turn.toCall > 0
          ? turn.toCall + c(' AIR 跟注压力', ' AIR TO CALL')
          : c('无需跟注时做出的决定', 'A NO-CALL DECISION'),
        'fill="#555a53"',
      ) +
      line(x(1) + 18, top + 201, x(1) + widthOfPanel - 18, top + 201, 'stroke="#c9cac0"') +
      stamp(x(1) + 76, top + 232, c('已记录', 'RECORDED'), ink, 112)
    : text(x(1) + 18, top + 69, 18, c('没有记录到转折', 'NO RECORDED TURN'), 'font-weight="700"') +
      text(x(1) + 18, top + 142, 54, '—', 'font-weight="700"') +
      text(
        x(1) + 18,
        top + 188,
        13,
        c('没有弃牌、跟注或全押', 'NO FOLD, CALL OR ALL-IN'),
        'fill="#555a53"',
      ) +
      text(
        x(1) + 18,
        top + 252,
        11,
        c('如实留白', 'NO INVENTED FACT'),
        'font-weight="700" letter-spacing="1.2" fill="#8a8f85"',
      );

  const winner = final.winner ?? model.winner;
  const resultTitle =
    winner === 'player'
      ? c('你留住了空气', 'YOU KEPT THE AIR')
      : winner === 'ai'
        ? c('空气先离开了你', 'THE AIR LEFT FIRST')
        : c('水面归于平衡', 'THE WATER SETTLED');
  const resultStamp = c(
    winner === 'player' ? '胜利' : winner === 'ai' ? '失利' : '平局',
    winner === 'player' ? 'VICTORY' : winner === 'ai' ? 'DEFEAT' : 'DRAW',
  );
  const stampColor = winner === 'ai' ? '#c46a61' : '#f5f3eb';
  const finalBody =
    text(x(2) + 18, top + 69, 18, resultTitle, 'font-weight="700" fill="#f5f3eb"') +
    text(
      x(2) + 18,
      top + 94,
      10,
      c('最终成手', 'FINAL HAND'),
      'font-weight="700" letter-spacing="1.3" fill="#b9beb2"',
    ) +
    comicHand(final.hand ?? [], x(2), top + 104, lang, final.failed) +
    text(
      x(2) + 18,
      top + 182,
      12,
      (final.round ? 'R' + pad2(final.round) + ' · ' : '') + settlementText(final.settlement, lang),
      'fill="#c9c9c0"',
    ) +
    text(
      x(2) + 18,
      top + 205,
      13,
      c('终局未开 ', 'FINAL RESERVE ') +
        (final.finalAir?.player ?? model.finalAir.player) +
        ' / ' +
        (final.finalAir?.ai ?? model.finalAir.ai),
      'font-weight="700" fill="#f5f3eb"',
    ) +
    stamp(x(2) + 86, top + 245, resultStamp, stampColor, 132);

  return (
    content +
    frame(0, 'THE BIGGEST WAGER', false, wagerBody) +
    frame(1, 'THE OTHER DECISION', false, turnBody) +
    frame(2, 'THE LAST BREATH', true, finalBody)
  );
}

function chart(model, lang) {
  const left = 114,
    right = 928,
    top = 968,
    bottom = 1092;
  const max = Math.max(25, ...model.points.flatMap((p) => [p.player, p.ai]));
  const cap = Math.ceil(max / 10) * 10;
  const x = (index) => left + ((right - left) * index) / Math.max(1, model.points.length - 1);
  const y = (value) => bottom - ((bottom - top) * value) / cap;
  let content = text(
    72,
    918,
    19,
    copy(lang, '每轮结束 · 未开空气储备', 'UNOPENED AIR · AFTER EACH ROUND'),
    'font-weight="700"',
  );
  content += text(
    72,
    943,
    15,
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
      1118,
      16,
      index === 0 ? copy(lang, '开局', 'START') : 'R' + point.round,
      'text-anchor="middle"',
    );
  });
  content +=
    line(742, 926, 772, 926, 'stroke="#20251f" stroke-width="4"') +
    text(782, 932, 15, copy(lang, '你', 'YOU'));
  content +=
    line(853, 926, 883, 926, 'stroke="#92978b" stroke-width="4" stroke-dasharray="7 5"') +
    text(893, 932, 15, copy(lang, '对手', 'OPPONENT'));
  return content;
}

function modeLine(meta, lang) {
  if (!meta?.opponent && !meta?.contract) return '';
  const c = (zh, en) => copy(lang, zh, en);
  let content = '';
  if (meta.opponent)
    content += text(
      72,
      142,
      14,
      c(
        meta.kind === 'difficulty' ? '难度' : '对手',
        meta.kind === 'difficulty' ? 'DIFFICULTY' : 'OPPONENT',
      ) +
        ' · ' +
        meta.opponent.name +
        ' / ' +
        meta.opponent.latin,
      'font-weight="700" letter-spacing="0.8"',
    );
  if (meta.contract) {
    const missed = meta.contractResult && !meta.contractResult.complete;
    content += text(
      1008,
      142,
      14,
      c(
        meta.kind === 'difficulty' ? '本档目标' : '契约',
        meta.kind === 'difficulty' ? 'LEVEL GOAL' : 'CONTRACT',
      ) +
        ' · ' +
        meta.contract.name +
        ' / ' +
        meta.contract.latin +
        (meta.contractResult ? ' · ' + meta.contractResult.status : ''),
      'text-anchor="end" letter-spacing="0.4" fill="' + (missed ? '#903d38' : '#62695e') + '"',
    );
  }
  return content;
}

export function shareImageSvg(model, lang = 'zh', meta = null) {
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
  body += modeLine(meta, lang);
  body += text(
    72,
    178,
    25,
    c('空气扑克 · 我的生存记录', 'AIR POKER · MY SURVIVAL RECORD'),
    'fill="#62695e"',
  );
  body += text(
    66,
    330,
    lang === 'en' ? 110 : 150,
    outcome,
    'font-weight="900" letter-spacing="-4"',
  );
  body += text(72, 392, lang === 'en' ? 30 : 37, title, 'font-weight="700"');
  body += text(
    72,
    432,
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
  body += '<rect x="72" y="452" width="936" height="92" fill="#e8e8df"/>';
  stats.forEach(([label, value], index) => {
    const x = 96 + index * 312;
    body +=
      text(x, 477, 18, label, 'fill="#62695e"') +
      text(
        x,
        524,
        40,
        value,
        'font-weight="700"' + (index === 2 && model.burned > 0 ? ' fill="#903d38"' : ''),
      );
  });
  body += comicStrip(model, lang);
  body += chart(model, lang);
  body += line(72, 1142, 1008, 1142, 'stroke="#20251f" stroke-width="2"');
  body += text(
    72,
    1182,
    20,
    c(
      '终局未开储备：你 ' + model.finalAir.player + ' / 对手 ' + model.finalAir.ai + ' AIR',
      'FINAL RESERVE: YOU ' + model.finalAir.player + ' / OPPONENT ' + model.finalAir.ai + ' AIR',
    ),
  );
  body += text(
    72,
    1216,
    19,
    c(
      '对局计时 ' + mins + ':' + String(secs).padStart(2, '0') + ' · 快进亦计入',
      'GAME CLOCK ' + mins + ':' + String(secs).padStart(2, '0') + ' · fast-forward counts',
    ),
    'fill="#62695e"',
  );
  body += text(72, 1278, 32, c('欢迎你来挑战。', 'COME TAKE THE CHALLENGE.'), 'font-weight="700"');
  body += text(
    72,
    1316,
    23,
    shareUrl(lang).replace('https://', ''),
    'font-family="Courier New, monospace"',
  );
  body += text(
    72,
    1376,
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

import { airTotals, isCompletedRecord } from '../game/records.js';
import { QR_MODULE_COUNT, shareQrPath, shareUrl } from './share-qr.js';

export { PLAY_URL, shareUrl } from './share-qr.js';

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
  '<path d="M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + '" ' + extra + '/>';
const path = (d, extra = '') => '<path d="' + d + '" ' + extra + '/>';
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
    '"><defs><pattern id="paper" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="#393e36" opacity=".08"/></pattern></defs><rect width="100%" height="100%" fill="#f5f1e8"/><rect width="100%" height="100%" fill="url(#paper)"/><g fill="#20251f" font-family="Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif">' +
    content +
    '</g></svg>'
  );
}

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
    '" stroke-width="2"/><text x="' +
    x +
    '" y="' +
    (y + 6) +
    '" fill="' +
    color +
    '" font-size="13" font-weight="700" letter-spacing="1.4" text-anchor="middle">' +
    xml(label) +
    '</text></g>'
  );
}

const PANEL_WIDTH = 304;
const PANEL_TOP = 642;
const PANEL_HEIGHT = 250;

function comicHand(hand, x, y, lang, failed = false) {
  if (!hand.length)
    return text(
      x + PANEL_WIDTH / 2,
      y + 30,
      14,
      failed
        ? copy(lang, '最终成手失败', 'FINAL HAND FAILED')
        : copy(lang, '未记录最终成手', 'NO FINAL HAND RECORDED'),
      'text-anchor="middle" fill="#c9c9c0"',
    );
  const cardWidth = 36,
    cardHeight = 52,
    gap = 8,
    start = x + (PANEL_WIDTH - (cardWidth * 5 + gap * 4)) / 2;
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
        '" rx="2" fill="#f8f5ed" stroke="#f8f5ed" stroke-width="2"/>' +
        text(
          cx + cardWidth / 2,
          y + 21,
          17,
          card.rank,
          'text-anchor="middle" font-weight="700" fill="#20251f"',
        ) +
        text(cx + cardWidth / 2, y + 43, 18, card.suit, 'text-anchor="middle" fill="#20251f"')
      );
    })
    .join('');
}

function comicStrip(model, lang, theme) {
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
  const left = 72,
    gap = 12;
  const x = (index) => left + index * (PANEL_WIDTH + gap);
  const ink = '#20251f',
    paper = '#faf7ef',
    muted = '#62695e';
  let content = text(
    72,
    620,
    19,
    c('终局三格 · 只取本局事实', 'THREE FRAMES · RECORDED ONLY'),
    'font-weight="700" letter-spacing="1.5"',
  );
  content += text(
    1008,
    620,
    13,
    'AFTER THE WATER / ' + c('终局之后', 'THE LAST BREATH'),
    'text-anchor="end" fill="#62695e" letter-spacing="1"',
  );

  const frame = (index, kicker, dark, body) =>
    '<rect x="' +
    (x(index) + 5) +
    '" y="' +
    (PANEL_TOP + 7) +
    '" width="' +
    PANEL_WIDTH +
    '" height="' +
    PANEL_HEIGHT +
    '" fill="#20251f" opacity=".12"/>' +
    '<rect x="' +
    x(index) +
    '" y="' +
    PANEL_TOP +
    '" width="' +
    PANEL_WIDTH +
    '" height="' +
    PANEL_HEIGHT +
    '" fill="' +
    (dark ? ink : paper) +
    '" stroke="' +
    ink +
    '" stroke-width="3"/>' +
    line(
      x(index) + 18,
      PANEL_TOP + 47,
      x(index) + PANEL_WIDTH - 18,
      PANEL_TOP + 47,
      'stroke="' + (dark ? '#596057' : '#c5c7bd') + '"',
    ) +
    text(
      x(index) + PANEL_WIDTH - 16,
      PANEL_TOP + 32,
      23,
      pad2(index + 1),
      'text-anchor="end" font-weight="700" fill="' + (dark ? '#596057' : '#d4d4ca') + '"',
    ) +
    text(
      x(index) + 18,
      PANEL_TOP + 31,
      12,
      kicker,
      'font-weight="700" letter-spacing="1.1" fill="' + (dark ? '#b9beb2' : muted) + '"',
    ) +
    body;

  const wager = comic.wager;
  const wagerBody = wager
    ? text(
        x(0) + 18,
        PANEL_TOP + 76,
        18,
        'R' + pad2(wager.round) + ' · ' + actionText(wager.action, lang),
        'font-weight="700"',
      ) +
      text(
        x(0) + 18,
        PANEL_TOP + 137,
        wager.paid > 0 ? 56 : 36,
        wager.paid > 0 ? wager.paid : actionText(wager.action, lang),
        'font-weight="700" letter-spacing="-2" fill="' + theme.accent + '"',
      ) +
      text(
        x(0) + 18,
        PANEL_TOP + 160,
        12,
        c('已投入空气', 'AIR COMMITTED'),
        'font-weight="700" letter-spacing="1.1" fill="#62695e"',
      ) +
      line(
        x(0) + 18,
        PANEL_TOP + 178,
        x(0) + PANEL_WIDTH - 18,
        PANEL_TOP + 178,
        'stroke="#c9cac0"',
      ) +
      text(
        x(0) + 18,
        PANEL_TOP + 202,
        13,
        c('目标 ', 'TARGET ') +
          (wager.target ?? '—') +
          c(' · 当时底池 ', ' · POT THEN ') +
          (wager.pot ?? '—'),
        'fill="#555a53"',
      ) +
      text(
        x(0) + 18,
        PANEL_TOP + 230,
        11,
        c('公开行动', 'PUBLIC ACTION'),
        'font-weight="700" letter-spacing="1.2" fill="#747a70"',
      )
    : text(
        x(0) + 18,
        PANEL_TOP + 76,
        17,
        c('没有记录到下注', 'NO RECORDED WAGER'),
        'font-weight="700"',
      ) +
      text(x(0) + 18, PANEL_TOP + 137, 50, '—', 'font-weight="700" fill="' + theme.accent + '"') +
      text(
        x(0) + 18,
        PANEL_TOP + 184,
        13,
        c('本局没有公开下注', 'NO PUBLIC BET IN THIS MATCH'),
        'fill="#555a53"',
      ) +
      text(
        x(0) + 18,
        PANEL_TOP + 230,
        11,
        c('如实留白', 'NO INVENTED FACT'),
        'font-weight="700" letter-spacing="1.2" fill="#747a70"',
      );

  const turn = comic.turn;
  const turnBody = turn
    ? text(
        x(1) + 18,
        PANEL_TOP + 76,
        18,
        'R' + pad2(turn.round) + ' · ' + c('决定', 'DECISION'),
        'font-weight="700"',
      ) +
      text(
        x(1) + 18,
        PANEL_TOP + 134,
        40,
        actionText(turn.action, lang),
        'font-weight="700" letter-spacing="-1"',
      ) +
      text(
        x(1) + 18,
        PANEL_TOP + 162,
        13,
        turn.toCall > 0
          ? turn.toCall + c(' AIR 跟注压力', ' AIR TO CALL')
          : c('无需跟注时做出的决定', 'A NO-CALL DECISION'),
        'fill="#555a53"',
      ) +
      line(
        x(1) + 18,
        PANEL_TOP + 184,
        x(1) + PANEL_WIDTH - 18,
        PANEL_TOP + 184,
        'stroke="#c9cac0"',
      ) +
      stamp(x(1) + 76, PANEL_TOP + 218, c('已记录', 'RECORDED'), ink, 112)
    : text(
        x(1) + 18,
        PANEL_TOP + 76,
        17,
        c('没有记录到转折', 'NO RECORDED TURN'),
        'font-weight="700"',
      ) +
      text(x(1) + 18, PANEL_TOP + 137, 50, '—', 'font-weight="700"') +
      text(
        x(1) + 18,
        PANEL_TOP + 184,
        13,
        c('没有弃牌、跟注或全押', 'NO FOLD, CALL OR ALL-IN'),
        'fill="#555a53"',
      ) +
      text(
        x(1) + 18,
        PANEL_TOP + 230,
        11,
        c('如实留白', 'NO INVENTED FACT'),
        'font-weight="700" letter-spacing="1.2" fill="#747a70"',
      );

  const winner = final.winner ?? model.winner;
  const resultTitle =
    winner === 'player'
      ? c('你留住了空气', 'YOU KEPT THE AIR')
      : winner === 'ai'
        ? c('空气先离开了你', 'THE AIR LEFT FIRST')
        : c('水面归于平衡', 'THE WATER SETTLED');
  const resultStamp = c(
    winner === 'player' ? '胜利' : winner === 'ai' ? '惜败' : '平局',
    winner === 'player' ? 'VICTORY' : winner === 'ai' ? 'NEXT ROUND' : 'DRAW',
  );
  const finalBody =
    text(x(2) + 18, PANEL_TOP + 76, 17, resultTitle, 'font-weight="700" fill="#f5f3eb"') +
    text(
      x(2) + 18,
      PANEL_TOP + 99,
      10,
      c('最终成手', 'FINAL HAND'),
      'font-weight="700" letter-spacing="1.3" fill="#b9beb2"',
    ) +
    comicHand(final.hand ?? [], x(2), PANEL_TOP + 108, lang, final.failed) +
    text(
      x(2) + 18,
      PANEL_TOP + 181,
      12,
      (final.round ? 'R' + pad2(final.round) + ' · ' : '') + settlementText(final.settlement, lang),
      'fill="#c9c9c0"',
    ) +
    text(
      x(2) + 18,
      PANEL_TOP + 204,
      13,
      c('终局未开 ', 'FINAL RESERVE ') +
        (final.finalAir?.player ?? model.finalAir.player) +
        ' / ' +
        (final.finalAir?.ai ?? model.finalAir.ai),
      'font-weight="700" fill="#f5f3eb"',
    ) +
    stamp(
      x(2) + 91,
      PANEL_TOP + 231,
      resultStamp,
      winner === 'ai' ? '#d38a7e' : theme.lightAccent,
      150,
    );

  return (
    content +
    frame(0, 'THE BIGGEST WAGER', false, wagerBody) +
    frame(1, 'THE OTHER DECISION', false, turnBody) +
    frame(2, 'THE LAST BREATH', true, finalBody)
  );
}

function chart(model, lang, theme) {
  const left = 114,
    right = 928,
    top = 990,
    bottom = 1100;
  const max = Math.max(25, ...model.points.flatMap((point) => [point.player, point.ai]));
  const cap = Math.ceil(max / 10) * 10;
  const x = (index) => left + ((right - left) * index) / Math.max(1, model.points.length - 1);
  const y = (value) => bottom - ((bottom - top) * value) / cap;
  let content = text(
    72,
    940,
    19,
    copy(lang, '每轮结束 · 未开空气储备', 'UNOPENED AIR · AFTER EACH ROUND'),
    'font-weight="700" letter-spacing="1"',
  );
  content += text(
    72,
    966,
    14,
    copy(
      lang,
      '按实际账目绘制；不含之后的耐息消耗',
      'Actual balances; excludes later endurance consumption',
    ),
    'fill="#62695e"',
  );
  for (const tick of [0, cap / 2, cap])
    content +=
      line(left, y(tick), right, y(tick), 'stroke="#c9ccbf"') +
      text(72, y(tick) + 6, 15, tick, 'fill="#62695e"');
  for (const [actor, color, dash] of [
    ['ai', '#92978b', 'stroke-dasharray="8 7"'],
    ['player', theme.accent, ''],
  ]) {
    const d = model.points
      .map((point, index) => (index ? 'L' : 'M') + x(index) + ' ' + y(point[actor]))
      .join(' ');
    content += path(
      d,
      'fill="none" stroke="' + color + '" stroke-width="4" stroke-linejoin="round" ' + dash,
    );
    content += model.points
      .map(
        (point, index) =>
          '<circle cx="' + x(index) + '" cy="' + y(point[actor]) + '" r="5" fill="' + color + '"/>',
      )
      .join('');
  }
  model.points.forEach((point, index) => {
    content += text(
      x(index),
      1126,
      15,
      index === 0 ? copy(lang, '开局', 'START') : 'R' + point.round,
      'text-anchor="middle" fill="#555a53"',
    );
  });
  content +=
    line(742, 944, 772, 944, 'stroke="' + theme.accent + '" stroke-width="4"') +
    text(782, 950, 15, copy(lang, '你', 'YOU'), 'font-weight="700"');
  content +=
    line(853, 944, 883, 944, 'stroke="#92978b" stroke-width="4" stroke-dasharray="7 5"') +
    text(893, 950, 15, copy(lang, '对手', 'OPPONENT'), 'fill="#62695e"');
  return content;
}

function modeLine(meta, lang) {
  if (!meta?.opponent && !meta?.contract) return '';
  const c = (zh, en) => copy(lang, zh, en);
  let content = '';
  if (meta.opponent)
    content += text(
      72,
      163,
      13,
      c(
        meta.kind === 'difficulty' ? '难度' : '对手',
        meta.kind === 'difficulty' ? 'DIFFICULTY' : 'OPPONENT',
      ) +
        ' · ' +
        meta.opponent.name +
        ' / ' +
        meta.opponent.latin,
      'font-weight="700" letter-spacing="0.8" fill="#555a53"',
    );
  if (meta.contract) {
    const missed = meta.contractResult && !meta.contractResult.complete;
    content += text(
      72,
      187,
      13,
      c(
        meta.kind === 'difficulty' ? '本档目标' : '契约',
        meta.kind === 'difficulty' ? 'LEVEL GOAL' : 'CONTRACT',
      ) +
        ' · ' +
        meta.contract.name +
        ' / ' +
        meta.contract.latin +
        (meta.contractResult ? ' · ' + meta.contractResult.status : ''),
      'letter-spacing="0.4" fill="' + (missed ? '#903d38' : '#62695e') + '"',
    );
  }
  return content;
}

function heroIllustration(win, draw, theme) {
  const drop = win ? 0 : 24;
  let content = '<g transform="translate(0 ' + drop + ')">';
  content +=
    '<circle cx="842" cy="289" r="128" fill="url(#halo)"/>' +
    '<circle cx="842" cy="289" r="108" fill="none" stroke="' +
    theme.accent +
    '" stroke-width="1.5" opacity=".34"/>';
  if (win) {
    content += path(
      'M842 130V105M737 165L719 143M947 165L965 143M691 289H664M993 289H1020M737 413L717 435M947 413L967 435',
      'fill="none" stroke="' + theme.accent + '" stroke-width="3" opacity=".48"',
    );
  }
  content +=
    '<g transform="translate(768 211) rotate(' +
    (win ? -11 : 8) +
    ' 72 82)">' +
    '<rect x="49" y="-18" width="116" height="164" rx="4" fill="#20251f"/>' +
    '<path d="M61 1L151 123M52 26L125 140M84 -9L157 91" stroke="#f5f1e8" opacity=".13"/>' +
    '<rect width="116" height="164" rx="4" fill="#faf7ef" stroke="#20251f" stroke-width="3"/>' +
    text(13, 37, 31, 'A', 'font-weight="900" fill="#20251f"') +
    text(15, 65, 28, '♠', 'fill="#20251f"') +
    text(58, 116, 62, '♦', 'text-anchor="middle" fill="' + (win ? theme.accent : '#903d38') + '"') +
    '</g>';
  content +=
    '<g transform="translate(922 269)">' +
    '<rect x="13" y="0" width="24" height="15" rx="3" fill="#20251f"/>' +
    '<rect x="6" y="12" width="38" height="12" rx="3" fill="#20251f"/>' +
    '<rect y="21" width="50" height="99" rx="24" fill="' +
    theme.accent +
    '" stroke="#20251f" stroke-width="3"/>' +
    '<rect x="6" y="48" width="38" height="42" rx="3" fill="#f5f1e8"/>' +
    text(25, 75, 15, 'AIR', 'text-anchor="middle" font-weight="900" fill="#20251f"') +
    '</g>';
  const bubbleSet = win
    ? [
        [963, 161, 13],
        [997, 118, 7],
        [929, 120, 5],
        [731, 170, 9],
        [706, 130, 5],
      ]
    : [
        [970, 179, 8],
        [995, 143, 5],
        [724, 186, 6],
      ];
  content += bubbleSet
    .map(
      ([cx, cy, r]) =>
        '<circle cx="' +
        cx +
        '" cy="' +
        cy +
        '" r="' +
        r +
        '" fill="none" stroke="' +
        theme.accent +
        '" stroke-width="2" opacity=".68"/>',
    )
    .join('');
  content += path(
    win
      ? 'M690 393Q758 365 826 393T962 393M716 415Q779 390 842 415T968 415'
      : 'M675 387Q745 363 815 387T955 387M661 411Q738 383 815 411T969 411M692 435Q759 412 826 435T960 435',
    'fill="none" stroke="' + theme.accent + '" stroke-width="2" opacity=".44"',
  );
  if (!win)
    content += '<rect x="724" y="435" width="236" height="20" fill="#f5f1e8" opacity=".96"/>';
  content += text(
    842,
    win ? 456 : 451,
    12,
    win ? 'SURFACE / AIR HELD' : draw ? 'STILL WATER / ONE MORE' : 'DEEP WATER / BREATHE AGAIN',
    'text-anchor="middle" font-family="Courier New, monospace" font-weight="700" letter-spacing="1.2" fill="#4f574f"',
  );
  return content + '</g>';
}

export function shareImageSvg(model, lang = 'zh', meta = null) {
  const win = model.winner === 'player',
    draw = model.winner === 'tie';
  const theme = win
    ? { accent: '#2f625e', lightAccent: '#b9ddd2', wash: '#d8e7df', stat: '#e7eee7' }
    : draw
      ? { accent: '#555f58', lightAccent: '#d7ddd4', wash: '#e2e4dd', stat: '#e9e9e1' }
      : { accent: '#59615b', lightAccent: '#e1ded3', wash: '#dedfd8', stat: '#e7e5dd' };
  const outcome = win
    ? copy(lang, '生还', 'SURVIVED')
    : draw
      ? copy(lang, '平局', 'A DRAW')
      : copy(lang, '惜败', 'DEFEATED');
  const title = win
    ? copy(lang, '我活到了最后。', 'I held my final breath.')
    : draw
      ? copy(lang, '同一秒，最后一口气。', 'The same final second.')
      : copy(lang, '下一局，再赌一口气。', 'One more round. One more breath.');
  const c = (zh, en) => copy(lang, zh, en);
  let body =
    '<defs><radialGradient id="halo"><stop offset="0" stop-color="' +
    theme.wash +
    '" stop-opacity=".96"/><stop offset="1" stop-color="' +
    theme.wash +
    '" stop-opacity="0"/></radialGradient><linearGradient id="reportWash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    theme.wash +
    '" stop-opacity=".42"/><stop offset=".58" stop-color="#f5f1e8" stop-opacity="0"/><stop offset="1" stop-color="' +
    theme.wash +
    '" stop-opacity=".24"/></linearGradient></defs>' +
    '<rect width="1080" height="1440" fill="url(#reportWash)"/>' +
    '<rect x="28" y="28" width="1024" height="1384" fill="none" stroke="#20251f" stroke-width="2"/>' +
    path(
      'M28 68H48M28 28V48M1032 28H1052M1052 28V48M28 1392H48M28 1392V1412M1032 1412H1052M1052 1392V1412',
      'fill="none" stroke="#20251f" stroke-width="5"',
    );
  body += text(
    72,
    96,
    lang === 'en' ? 58 : 66,
    c('空气扑克', 'AIR POKER'),
    'data-game-title="true" font-family="Arial Black, Microsoft YaHei, sans-serif" font-weight="900" letter-spacing="-1"',
  );
  body += line(
    72,
    108,
    lang === 'en' ? 392 : 336,
    108,
    'stroke="' + theme.accent + '" stroke-width="4"',
  );
  body += text(
    72,
    128,
    14,
    c('生存战报 · MATCH REPORT', 'SURVIVAL REPORT · MATCH CARD'),
    'font-weight="700" letter-spacing="1.8" fill="#555a53"',
  );
  body += text(
    1008,
    79,
    16,
    '25 AIR × 2',
    'text-anchor="end" font-family="Courier New, monospace" font-weight="700"',
  );
  body += text(
    1008,
    105,
    12,
    'BREATHE / BET / SURVIVE',
    'text-anchor="end" font-family="Courier New, monospace" letter-spacing="1.3" fill="#62695e"',
  );
  body += line(72, 141, 1008, 141, 'stroke="#20251f" stroke-width="2"');
  body += modeLine(meta, lang);
  body += text(
    72,
    216,
    14,
    win
      ? 'VICTORY / FINAL BREATH HELD'
      : draw
        ? 'DRAW / THE WATER SETTLED'
        : 'DEFEAT / THE NEXT BREATH IS YOURS',
    'font-family="Courier New, monospace" font-weight="700" letter-spacing="1.6" fill="' +
      (win ? theme.accent : '#903d38') +
      '"',
  );
  body += text(
    66,
    364,
    lang === 'en' ? (draw ? 96 : 88) : 150,
    outcome,
    'font-family="Arial Black, Microsoft YaHei, sans-serif" font-weight="900" letter-spacing="-4"',
  );
  body += line(
    72,
    386,
    win || draw ? 244 : 202,
    386,
    'stroke="' + (win ? theme.accent : '#903d38') + '" stroke-width="6"',
  );
  body += text(72, 420, lang === 'en' ? 29 : 32, title, 'font-weight="700"');
  body += text(
    72,
    454,
    19,
    c('你下注的，是下一口空气。', 'Your next breath is on the table.'),
    'fill="#555a53" letter-spacing="0.5"',
  );
  body += heroIllustration(win, draw, theme);

  const mins = Math.floor(model.elapsedMs / 60000),
    secs = Math.floor(model.elapsedMs / 1000) % 60;
  const stats = [
    [c('完成轮次', 'ROUNDS'), model.rounds + ' / 5'],
    [c('重叠灾厄', 'CALAMITIES'), String(model.calamities)],
    [c('实际烧毁', 'AIR BURNED'), String(model.burned)],
  ];
  body +=
    '<rect x="72" y="478" width="936" height="104" fill="' + theme.stat + '" stroke="#bfc4b9"/>';
  stats.forEach(([label, value], index) => {
    const x = 96 + index * 312;
    if (index) body += line(x - 24, 497, x - 24, 563, 'stroke="#c3c7bc"');
    body +=
      text(x, 508, 15, label, 'fill="#555a53" font-weight="700" letter-spacing="1"') +
      text(
        x,
        558,
        39,
        value,
        'font-family="Courier New, monospace" font-weight="700"' +
          (index === 2 && model.burned > 0 ? ' fill="#903d38"' : ''),
      );
  });
  body += comicStrip(model, lang, theme);
  body += chart(model, lang, theme);
  body += line(72, 1152, 1008, 1152, 'stroke="#20251f" stroke-width="2"');
  body += line(779, 1174, 779, 1378, 'stroke="#bfc4b9"');
  body += text(
    72,
    1204,
    27,
    c('欢迎你来挑战。', 'COME TAKE THE CHALLENGE.'),
    'font-weight="900" letter-spacing="0.5"',
  );
  body += text(
    72,
    1241,
    18,
    shareUrl(lang).replace('https://', ''),
    'font-family="Courier New, monospace" fill="#555a53"',
  );
  body += text(
    72,
    1287,
    19,
    c(
      '终局未开储备：你 ' + model.finalAir.player + ' / 对手 ' + model.finalAir.ai + ' AIR',
      'FINAL RESERVE: YOU ' + model.finalAir.player + ' / OPPONENT ' + model.finalAir.ai + ' AIR',
    ),
    'font-weight="700"',
  );
  body += text(
    72,
    1321,
    16,
    c(
      '对局计时 ' + mins + ':' + String(secs).padStart(2, '0') + ' · 快进亦计入',
      'GAME CLOCK ' + mins + ':' + String(secs).padStart(2, '0') + ' · fast-forward counts',
    ),
    'fill="#62695e"',
  );
  body += text(
    72,
    1379,
    15,
    c(
      '改编自迫稔雄《噬谎者》第 40–43 卷「空气扑克」篇',
      'Based on Toshio Sako’s USOGUI, volumes 40–43 · Air Poker',
    ),
    'fill="#555a53"',
  );
  const qrSize = QR_MODULE_COUNT * 5;
  body +=
    '<g data-share-url="' +
    xml(shareUrl(lang)) +
    '" data-qr-version="4" data-qr-error-correction="Q" transform="translate(811 1172)">' +
    '<rect width="' +
    qrSize +
    '" height="' +
    qrSize +
    '" fill="#fffef8"/>' +
    '<path d="' +
    shareQrPath(lang) +
    '" transform="scale(5)" fill="#151a17" shape-rendering="crispEdges"/>' +
    '</g>';
  body += text(
    913,
    1401,
    12,
    c('扫码，坐上牌桌', 'SCAN TO TAKE A SEAT'),
    'text-anchor="middle" font-weight="700" letter-spacing="0.8" fill="#555a53"',
  );
  return shell(1080, 1440, body, lang).replace(
    'role="img"',
    'data-outcome="' + (win ? 'victory' : draw ? 'draw' : 'defeat') + '" role="img"',
  );
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

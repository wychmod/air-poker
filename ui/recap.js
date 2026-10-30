import { cardMarkup } from './battle.js';
import { comicFacts } from './share.js';

const pick = (lang, zh, en) => (lang === 'en' ? en : zh);
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

const actionLabel = (action, lang) => {
  const moved = action.raised ? ` +${action.raised}` : '';
  const paid = action.paid ? ` · ${action.paid} AIR` : '';
  if (action.action === 'fold') return pick(lang, '弃牌', 'FOLD');
  if (action.action === 'all-in') return pick(lang, '全押', 'ALL-IN') + paid;
  if (action.action === 'raise') return pick(lang, '加注', 'RAISE') + moved + paid;
  if (action.action === 'call') return pick(lang, '跟注', 'CALL') + paid;
  return pick(lang, '过牌', 'CHECK');
};

const winnerLabel = (winner, lang) =>
  winner === 'player'
    ? pick(lang, '你赢下这一轮', 'You take the round')
    : winner === 'ai'
      ? pick(lang, '对手赢下这一轮', 'Opponent takes the round')
      : pick(lang, '平手', 'Round tied');

function wagerPanel(wager, lang) {
  if (!wager) return '';
  return `<article class="recap-panel recap-wager"><span class="recap-index">01</span><p class="recap-kicker">THE BIGGEST WAGER</p><h3>R${String(wager.round).padStart(2, '0')} · ${esc(actionLabel(wager, lang))}</h3><strong class="recap-big">${wager.paid || 0}<small>AIR</small></strong><p>${pick(lang, '目标', 'TARGET')} ${esc(wager.target ?? '—')} · ${pick(lang, '底池', 'POT')} ${esc(wager.pot ?? '—')}</p></article>`;
}

function turnPanel(turn, lang) {
  if (!turn) return '';
  return `<article class="recap-panel recap-turn"><span class="recap-index">02</span><p class="recap-kicker">THE TURNING POINT</p><h3>R${String(turn.round).padStart(2, '0')} · ${esc(actionLabel(turn, lang))}</h3><p>${pick(lang, '在', 'At')} ${turn.toCall ? `${turn.toCall} AIR ${pick(lang, '跟注压力', 'to call')}` : pick(lang, '无需跟注时做出的决定', 'a no-call decision')}。</p><span class="recap-stamp">${pick(lang, '已记录', 'RECORDED')}</span></article>`;
}

function finalPanel(final, lang) {
  const settlement = final.settlement;
  const hand = final.hand;
  const cards = hand?.length
    ? `<div class="battle-cards recap-hand" aria-label="${pick(lang, '最后成手', 'Final hand')}">${hand.map((card) => cardMarkup(card)).join('')}</div>`
    : '';
  return `<article class="recap-panel recap-final"><span class="recap-index">03</span><p class="recap-kicker">THE LAST BREATH</p><h3>${final.winner === 'player' ? pick(lang, '你留住了空气', 'You kept the air') : final.winner === 'ai' ? pick(lang, '空气先离开了你', 'The air left first') : pick(lang, '水面归于平衡', 'The water settled')}</h3>${cards}<p>${settlement ? winnerLabel(settlement, lang) : pick(lang, '对局结束', 'Match ended')} · ${pick(lang, '最终 AIR', 'FINAL AIR')} ${esc(final.finalAir?.player ?? '—')} / ${esc(final.finalAir?.ai ?? '—')}</p><span class="recap-stamp ${final.winner === 'player' ? 'is-win' : 'is-loss'}">${final.winner === 'player' ? pick(lang, '胜利', 'VICTORY') : final.winner === 'ai' ? pick(lang, '失利', 'DEFEAT') : pick(lang, '平局', 'DRAW')}</span></article>`;
}

export function comicRecapMarkup(record, lang = 'zh') {
  if (!record?.result || record.status !== 'completed') return '';
  const facts = comicFacts(record);
  const panels = [
    wagerPanel(facts.wager, lang),
    turnPanel(facts.turn, lang),
    finalPanel(facts.final, lang),
  ].filter(Boolean);
  if (!panels.length) return '';
  return `<section class="comic-recap" aria-labelledby="comicRecapTitle"><header class="comic-recap-head"><p class="eyebrow">AFTER THE WATER / 终局之后</p><h2 id="comicRecapTitle">${pick(lang, '这一局，留下三格。', 'Three frames remain.')}</h2><p>${pick(lang, '每一格都来自本局真实记录。', 'Every frame comes from this match record.')}</p></header><div class="comic-recap-grid">${panels.join('')}</div></section>`;
}

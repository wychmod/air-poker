import { translate } from '../i18n.js';
import { recordMarkup } from './record.js';

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const signed = (value) => (value > 0 ? `+${value}` : String(value));
const clock = (ms) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export function reviewEvents(record, round) {
  return record?.events.filter((event) => round === 'all' || event.round === Number(round)) ?? [];
}

export function reviewMarkup(record, view, selection) {
  const en = view.lang === 'en';
  const c = (zh, english) => (en ? english : zh);
  const t = (key) => escape(translate(view.lang, key));
  if (!record)
    return `<div class="review-empty"><p class="eyebrow">MATCH ARCHIVE</p><h2>${c('这里还没有对局记录。', 'No match recorded yet.')}</h2><p>${c('完成一局后，这里会留下每一手牌与每一次空气转移。', 'Complete a match to keep its hands and every AIR transfer here.')}</p></div>`;
  const actor = (key) =>
    key === 'player' ? c('你', 'You') : key === 'ai' ? t('cpu') : t(`account_${key}`);
  const events = reviewEvents(record, selection.round);
  const eventIndex = Math.min(Math.max(0, selection.event ?? 0), Math.max(0, events.length - 1));
  const event = events[eventIndex];
  const round = record.rounds.find((item) => item.number === Number(selection.round));
  const attempt =
    round?.attempts[
      Math.min(selection.attempt ?? round.attempts.length - 1, round.attempts.length - 1)
    ];
  const settlement = round?.settlement;
  const transfer =
    event?.type === 'air-transfer' ? record.ledger.find((entry) => entry.id === event.id) : null;
  const balance = transfer?.after ?? record.accounts;
  function hand(entry, who) {
    return `<section class="review-hand"><h3>${actor(who)} <small>${round?.targets ? ` / ${c('目标', 'Target')} ${round.targets[who].value}` : ''}</small></h3>${!entry ? `<div class="review-hidden">${c('尚未公开', 'Not revealed')}</div>` : !entry.valid ? `<p>${t(`failure_${entry.reason}`)}</p>` : `<div class="review-cards">${entry.hand.map((card) => `<span class="review-card ${card.suit === '♥' || card.suit === '♦' ? 'red' : ''}"><b>${escape(card.rank)}</b><span>${escape(card.suit)}</span></span>`).join('')}</div>`}</section>`;
  }
  function eventLabel(entry) {
    const d = entry.details;
    if (entry.type === 'air-transfer')
      return `${t(`money_${d.reason}`)} · ${actor(d.from)} → ${actor(d.to)} · ${d.amount} AIR`;
    if (entry.type === 'bet-action')
      return `${actor(d.actor)} · ${t(`action_${d.action}`)} · ${c('实付', 'Paid')} ${escape(d.paid)} AIR`;
    if (entry.type === 'targets-revealed')
      return `${c('公开数字', 'Targets revealed')} · ${escape(d.player?.value)} / ${escape(d.ai?.value)}`;
    if (entry.type === 'hand-submitted')
      return `${t('event_hand-submitted')} · ${d.valid ? t('recordValid') : t(`failure_${d.reason}`)}`;
    if (entry.type === 'match-ended')
      return `${t('event_match-ended')} · ${d.winner === 'tie' ? t('draw') : actor(d.winner)}`;
    return t(`event_${entry.type}`);
  }
  const points = [{ elapsedMs: 0, after: record.initialAir }, ...record.ledger];
  const trend = (who) =>
    points
      .map(
        (point, index) =>
          `${20 + (index / Math.max(1, points.length - 1)) * 560},${140 - (point.after[who] / 50) * 120}`,
      )
      .join(' ');
  return `<div class="review-heading"><p class="eyebrow">MATCH ARCHIVE / ${escape(record.matchId.slice(-10))}</p><h2>${record.result ? (record.result.winner === 'tie' ? c('本局平局', 'A shared ending') : record.result.winner === 'player' ? c('胜利之后，回看每一步。', 'Revisit your victory.') : c('每一次选择，都有迹可循。', 'Every choice leaves a trace.')) : c('对局进行中 · 打开时快照', 'Live match · snapshot at opening')}</h2><p>${record.result ? `${t(`recordReason_${record.result.reason}`)} · ${c('完成', 'Completed')} ${record.result.completedRounds} / 5 · ` : ''}${clock(record.elapsedMs)} · ${c('只读查看不暂停正式对局', 'Viewing does not pause a live match')}</p></div>
  <div class="review-layout"><nav class="review-rounds" aria-label="${c('回合与尝试', 'Rounds and attempts')}"><button data-action="review-round" data-round="all" aria-pressed="${selection.round === 'all'}"><span>${c('整局时间线', 'Match timeline')}</span><small>${record.events.length} ${c('个事件', 'events')}</small></button>${record.rounds.map((item) => `<button data-action="review-round" data-round="${item.number}" aria-pressed="${Number(selection.round) === item.number}"><b>R${String(item.number).padStart(2, '0')}</b><span>${t(`roundStatus_${item.status}`)}</span><small>${item.attempts.length} ${c('次构造', 'attempts')}</small></button>`).join('')}</nav>
  <div class="review-detail">
  ${round ? `<div class="review-round-head"><h3>${c('第', 'Round')} ${round.number} ${c('轮', '')} · ${t(`roundStatus_${round.status}`)}</h3><div class="review-attempts">${round.attempts.map((item, index) => `<button class="button secondary" data-action="review-attempt" data-index="${index}" aria-pressed="${item.id === attempt?.id}">${c('尝试', 'Attempt')} ${item.number}</button>`).join('')}</div></div><div class="review-hands">${hand(attempt?.player, 'player')}${hand(attempt?.ai, 'ai')}</div>${settlement ? `<p class="review-basis">${c('结算依据', 'Basis')}: ${t(`basis_${settlement.reason}`)} · ${c('实际烧毁', 'Actually burned')} ${settlement.burned} AIR</p>` : ''}<div class="review-totals">${['player', 'ai'].map((who) => `<div><strong>${actor(who)} · ${c('净变化', 'Net change')} ${signed(round.totals[who].net)}</strong><span>${c('投入', 'Paid')} ${round.totals[who].ante + round.totals[who].bet} / ${c('收款', 'Received')} ${round.totals[who].received} / ${c('退款', 'Refund')} ${round.totals[who].refunded} / ${c('烧毁', 'Burned')} ${round.totals[who].burned}</span></div>`).join('')}</div>` : ''}
  <section class="review-event" aria-label="${c('选中事件', 'Selected event')}"><p class="eyebrow">${c('事件', 'EVENT')} ${events.length ? eventIndex + 1 : 0} / ${events.length} ${event ? ` · #${event.id} · ${clock(event.elapsedMs)}` : ''}</p><h3>${event ? eventLabel(event) : c('尚无事件', 'No events')}</h3>${transfer ? `<div class="transfer-path"><span>${actor(transfer.from)}</span><b class="transfer-token">${transfer.amount} AIR →</b><span>${actor(transfer.to)}</span></div><p class="review-account-line">${['player', 'ai', 'pot', 'breathing', 'burned'].map((key) => `${actor(key)} ${balance[key]}`).join(' + ')} = ${Object.values(balance).reduce((a, b) => a + b, 0)}</p>` : `<p>${c('这是已记录的事实。播放仅按事件序号展示，不重新运行对局。', 'This is a recorded fact. Playback follows event order without rerunning the match.')}</p>`}</section>
  <div class="review-controls"><button class="button primary" data-action="review-play" ${events.length < 2 ? 'disabled' : ''}>${selection.playing ? c('暂停', 'Pause') : c('播放事件', 'Play events')}</button><button class="button secondary" data-action="review-restart">${c('从头', 'Restart')}</button><label>${c('事件序号', 'Event index')}<input id="reviewSeek" type="range" min="0" max="${Math.max(0, events.length - 1)}" value="${eventIndex}" ${events.length < 2 ? 'disabled' : ''} /></label></div>
  <ol class="review-event-list">${events.map((entry, index) => `<li><button data-action="review-event" data-index="${index}" aria-current="${index === eventIndex ? 'step' : 'false'}"><small>#${entry.id} · ${clock(entry.elapsedMs)}</small><span>${eventLabel(entry)}</span></button></li>`).join('')}</ol>
  <details class="review-accounts"><summary>${c('展开五账户与空气趋势', 'Five accounts and AIR trend')}</summary><p>${c('玩家未开 + 对手未开 + 底池 + 累计已开 + 实际烧毁', 'Your reserve + opponent reserve + pot + opened + burned')} = ${record.accounting.accountedTotal} / ${record.accounting.initialTotal}</p><svg viewBox="0 0 600 160" role="img" aria-label="${c('按转移顺序绘制的未开余额趋势，实线为你，虚线为对手；精确数据在完整账目中。', 'Reserve by transfer order: solid for you, dashed for the opponent. Exact values are in the full ledger.')}"><path d="M20 20 V140 H580" fill="none" stroke="#aaa"/><polyline points="${trend('player')}" fill="none" stroke="#171917" stroke-width="2"/><polyline points="${trend('ai')}" fill="none" stroke="#9c3737" stroke-dasharray="5 4" stroke-width="2"/></svg><p>${c('实线：你；虚线：对手。横轴为资金转移序号；精确账户见下方完整明细。', 'Solid: you; dashed: opponent. Horizontal axis: transfer order. Exact balances are listed below.')}</p></details>
  <details class="review-full"><summary>${c('完整明细、牌型比较与逐笔账目', 'Full details, hand comparison and ledger')}</summary>${recordMarkup(record, view.lang)}</details>
  </div></div>`;
}

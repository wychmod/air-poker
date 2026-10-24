import { translate } from '../i18n.js';

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const signed = (value) => (value > 0 ? `+${value}` : String(value));
const time = (ms) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;

export function recordMarkup(record, lang) {
  const t = (key, values) => escape(translate(lang, key, values));
  const actor = (key) => t(key === 'player' ? 'you' : key === 'ai' ? 'cpu' : `account_${key}`);
  if (!record) return `<h2>${t('recordTitle')}</h2><p>${t('recordEmpty')}</p>`;
  const balanceLine = (balances) =>
    `${t('you')} ${balances.player} / ${t('cpu')} ${balances.ai} · ${t('account_pot')} ${balances.pot} · ${t('account_breathing')} ${balances.breathing} · ${t('account_burned')} ${balances.burned}`;
  const handLine = (entry) =>
    entry == null
      ? t('recordHidden')
      : entry.valid
        ? escape(entry.hand.map((card) => card.rank + card.suit).join(' '))
        : t(`failure_${entry.reason}`);
  const rankLine = (rank) => (rank ? `${t(rank.key)} [${rank.tie.join(', ')}]` : t('upperFailed'));
  function eventLine(entry) {
    const d = entry.details;
    const label = t(`event_${entry.type}`);
    if (entry.type === 'air-transfer')
      return `${t(`money_${d.reason}`)} · ${actor(d.from)} → ${actor(d.to)} · ${d.amount} AIR`;
    if (entry.type === 'bet-action')
      return `${actor(d.actor)} · ${t(`action_${d.action}`)} · ${t('recordPaid')} ${escape(d.paid)} AIR${d.timedOut ? ` · ${t('recordTimeout')}` : ''}`;
    if (entry.type === 'targets-revealed')
      return `${label} · ${t('you')} ${escape(d.player?.value)} / ${t('cpu')} ${escape(d.ai?.value)}`;
    if (entry.type === 'hand-submitted')
      return `${label} · ${d.valid ? t('recordValid') : t(`failure_${d.reason}`)}`;
    if (entry.type === 'candidate-selected') return `${label} ${escape(d.index + 1)}`;
    if (entry.type === 'attempt-started') return `${label} ${escape(d.number)}`;
    if (entry.type === 'round-ended') return `${label} · ${t(`roundStatus_${d.status}`)}`;
    if (entry.type === 'endurance-started') return `${label} · ${t(`recordReason_${d.reason}`)}`;
    if (entry.type === 'match-ended')
      return `${label} · ${d.winner === 'tie' ? t('draw') : actor(d.winner)}`;
    return label;
  }
  return `<h2>${t('recordTitle')}</h2>
    <p>${t(record.status === 'completed' ? 'recordCompleted' : 'recordOngoing')} · ${t('recordAsOf')} ${time(record.elapsedMs)}<br>${t('recordReadOnly')}</p>
    ${record.result ? `<p><strong>${t('recordResult')}: ${record.result.winner === 'tie' ? t('draw') : `${actor(record.result.winner)} · ${t('recordWinner')}`}</strong><br>${t('recordCompletedRounds')} ${record.result.completedRounds} / ${record.rules.maxRounds} · ${t(`recordReason_${record.result.reason}`)}${record.result.enduranceReason ? ` · ${t(`recordReason_${record.result.enduranceReason}`)}` : ''}</p>` : ''}
    <div class="rule-grid">${['player', 'ai', 'breathing', 'burned'].map((key) => `<div><b>${record.accounts[key]}</b><span>${actor(key)}</span></div>`).join('')}</div>
    <p>${balanceLine(record.accounts)}<br><strong>${t(record.accounting.balanced ? 'recordBalanced' : 'recordUnbalanced')} ${record.accounting.accountedTotal} / ${record.accounting.initialTotal}</strong></p>
    <h3>${t('recordTotals')}</h3>
    ${['player', 'ai']
      .map((key) => {
        const v = record.totals[key];
        return `<p><strong>${actor(key)} · ${t('recordNet')} ${signed(v.net)} AIR</strong><br>${t('recordAnte')} ${v.ante} · ${t('recordBet')} ${v.bet} · ${t('recordReceived')} ${v.received} · ${t('recordRefund')} ${v.refunded} · ${t('account_breathing')} ${v.breathing} · ${t('account_burned')} ${v.burned}</p>`;
      })
      .join('')}
    <h3>${t('recordRounds')}</h3>
    ${record.rounds
      .map(
        (
          round,
        ) => `<details><summary>R${round.number} · ${t(`roundStatus_${round.status}`)}${round.settlement ? ` · ${round.settlement.winner === 'tie' ? t('draw') : actor(round.settlement.winner)}` : ''}</summary>
      <p>${t('recordBefore')} ${round.airBefore.player} / ${round.airBefore.ai}${round.airAfter ? ` → ${round.airAfter.player} / ${round.airAfter.ai}` : ''}<br>${t('recordNet')} ${t('you')} ${signed(round.totals.player.net)} / ${t('cpu')} ${signed(round.totals.ai.net)} AIR</p>
      ${round.targets ? `<p>TARGET ${round.targets.player.value} / ${round.targets.ai.value} · ${t('recordFirst')} ${actor(round.firstBettor)}</p>` : ''}
      ${round.attempts.map((attempt) => `<p><strong>${t('recordAttempt')} ${attempt.number}</strong> · ${time(attempt.startedAtMs)}<br>${t('you')}: ${handLine(attempt.player)}<br>${t('cpu')}: ${handLine(attempt.ai)}</p>`).join('')}
      ${round.actions.length ? `<h4>${t('recordActions')}</h4><ol>${round.actions.map((action) => `<li><p>${time(action.elapsedMs)} · ${eventLine({ type: 'bet-action', details: action })}<br>${t('recordCalled')} ${escape(action.called)} · ${t('recordRaised')} ${escape(action.raised)} · ${t('account_pot')} ${escape(action.pot)} AIR</p></li>`).join('')}</ol>` : ''}
      ${round.settlement ? `<p>${t('recordBasis')}: ${t(`basis_${round.settlement.reason}`)}<br>${t('you')} ${rankLine(round.settlement.playerRank)} / ${t('cpu')} ${rankLine(round.settlement.aiRank)}<br>${t('recordCommitted')} ${round.settlement.committed.player} / ${round.settlement.committed.ai} AIR · ${t('recordReceived')} ${round.settlement.received.player} / ${round.settlement.received.ai} AIR<br>${t('account_burned')} ${round.settlement.burned} AIR · ${t('recordOverlap')} ${round.settlement.overlap.map((card) => escape(card.rank + card.suit)).join(' ') || '0'}</p>` : ''}
      <p>${t('recordUsedBefore')} ${round.discardBefore.length} → ${round.discardAfter?.length ?? round.discardBefore.length}</p>
    </details>`,
      )
      .join('')}
    <details><summary>${t('recordLedger')} · ${record.ledger.length}</summary><ol>${record.ledger.map((entry) => `<li><p>#${entry.id} · ${time(entry.elapsedMs)} · ${entry.round === null ? t('recordBetween') : `R${entry.round}`}<br>${t(`money_${entry.reason}`)}: ${actor(entry.from)} → ${actor(entry.to)} · ${entry.amount} AIR<br>${balanceLine(entry.after)}</p></li>`).join('')}</ol></details>
    <details><summary>${t('recordTimeline')} · ${record.events.length}</summary><ol>${record.events.map((entry) => `<li><p>#${entry.id} · ${time(entry.elapsedMs)} · ${entry.round === null ? t('recordBetween') : `R${entry.round}`}<br>${eventLine(entry)}</p></li>`).join('')}</ol></details>`;
}

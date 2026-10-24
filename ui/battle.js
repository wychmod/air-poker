import { translate } from '../i18n.js';
import { rankHand } from '../game/rules.js';
import { CANISTER_MS, HYPOXIA_MS } from '../game/breathing.js';

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const copy = (lang, zh, en) => (lang === 'zh' ? zh : en);
const signed = (value) => (value > 0 ? '+' + value : String(value));
const clock = (ms) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return (
    String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
  );
};

export function cardMarkup(card, { overlap = false, key = false } = {}) {
  return (
    '<span class="battle-card' +
    (card.red ? ' is-red' : '') +
    (overlap ? ' is-overlap' : '') +
    (key ? ' is-key' : '') +
    '" data-card-id="' +
    esc(card.id) +
    '" role="img" aria-label="' +
    esc(card.rank + card.suit) +
    '"><span class="battle-card-corner">' +
    esc(card.rank) +
    '<small>' +
    esc(card.suit) +
    '</small></span><span class="battle-card-suit" aria-hidden="true">' +
    esc(card.suit) +
    '</span><span class="battle-card-foot" aria-hidden="true">' +
    esc(card.rank + card.suit) +
    '</span></span>'
  );
}

function backs(lang) {
  return (
    '<div class="battle-cards battle-hidden-hand" aria-label="' +
    copy(lang, '五张未公开的牌', 'Five hidden cards') +
    '">' +
    '<span class="battle-card battle-card-back" aria-hidden="true"><i>◇</i></span>'.repeat(5) +
    '</div>'
  );
}

function supplyText(state, actor, lang) {
  const supply = state.respiration[actor];
  return supply.remainingMs > 0
    ? copy(lang, '供气 ', 'Supply ') + clock(supply.remainingMs)
    : copy(lang, '缺氧宽限 ', 'Grace ') + clock(HYPOXIA_MS - supply.shortageMs);
}

function supplyRatio(state, actor) {
  const supply = state.respiration[actor];
  return Math.max(
    0,
    Math.min(
      1,
      supply.remainingMs > 0
        ? supply.remainingMs / CANISTER_MS
        : (HYPOXIA_MS - supply.shortageMs) / HYPOXIA_MS,
    ),
  );
}

function resources(state, lang) {
  const actor = (id, name) =>
    '<div class="battle-resource"><span class="battle-resource-name">' +
    name +
    '<small>' +
    copy(lang, '未开储备', 'UNOPENED') +
    '</small></span><strong data-air="' +
    id +
    '">' +
    state[id + 'Air'] +
    '<small>AIR</small></strong><span class="battle-supply" data-breath="' +
    id +
    '">' +
    supplyText(state, id, lang) +
    '</span></div>';
  return (
    '<div class="battle-resources">' +
    actor('ai', 'CPU') +
    '<div class="battle-pot"><span>' +
    copy(lang, '第 ', 'ROUND ') +
    String(state.round).padStart(2, '0') +
    ' / ' +
    String(state.maxRounds).padStart(2, '0') +
    '</span><strong data-pot>' +
    state.pot +
    '</strong><small>' +
    copy(lang, '底池 AIR', 'POT · AIR') +
    '</small></div>' +
    actor('player', copy(lang, '你', 'YOU')) +
    '</div>'
  );
}

function heading(kicker, title, detail, timer, lang) {
  return (
    '<header class="battle-heading"><div><p class="eyebrow">' +
    kicker +
    '</p><h2 tabindex="-1" data-phase-heading>' +
    title +
    '</h2><p>' +
    detail +
    '</p></div>' +
    (timer !== undefined
      ? '<div class="battle-timer"><strong id="turnTimer">' +
        (timer ?? '—') +
        '</strong><span>' +
        copy(lang, '行动秒数', 'SECONDS') +
        '</span></div>'
      : '') +
    '</header>'
  );
}

function targetSlots(state, lang) {
  return (
    '<div class="battle-targets"><span>CPU <b data-target-slot="ai">' +
    (state.aiTarget ?? '—') +
    '</b><small>' +
    copy(lang, '成手隐藏', 'HAND HIDDEN') +
    '</small></span><span>' +
    copy(lang, '你的目标', 'YOUR TARGET') +
    ' <b data-target-slot="player">' +
    (state.playerTarget ?? '—') +
    '</b></span></div>'
  );
}

function actionBar(note, buttons) {
  return (
    '<footer class="battle-actions"><p>' +
    note +
    '</p><div class="battle-action-buttons">' +
    buttons +
    '</div></footer>'
  );
}

function lower(state, view) {
  const lang = view.lang;
  const selected =
    Number.isInteger(view.selectedTarget) && state.targetPlayable[view.selectedTarget]
      ? view.selectedTarget
      : null;
  const selectedValue = selected === null ? null : state.targets[selected];
  return (
    heading(
      '01 / ' + copy(lang, '公开目标', 'DECLARE'),
      copy(lang, '选择你的数字。', 'Choose your number.'),
      copy(
        lang,
        '数字是五张牌的点数和。选中后，再确认出牌。',
        'Your number is the sum of five cards. Select one, then confirm.',
      ),
      undefined,
      lang,
    ) +
    '<div class="battle-number-row">' +
    state.targets
      .map((target, index) => {
        const used = state.usedTargets.includes(index);
        const label = used
          ? copy(lang, '已用', 'USED')
          : selected === index
            ? copy(lang, '已选 · 未公开', 'SELECTED')
            : state.targetSolvable[index]
              ? copy(lang, '可以成手', 'AVAILABLE')
              : copy(lang, '当前无法成手', 'NO VALID HAND');
        return (
          '<button type="button" class="battle-number' +
          (selected === index ? ' is-selected' : '') +
          (used ? ' is-used' : '') +
          '" data-action="choose-target" data-index="' +
          index +
          '" data-target-index="' +
          index +
          '" aria-pressed="' +
          (selected === index) +
          '" ' +
          (!state.targetPlayable[index] ? 'disabled' : '') +
          '><span class="battle-number-index">NO. 0' +
          (index + 1) +
          '</span><strong>' +
          target +
          '</strong><small>' +
          label +
          '</small></button>'
        );
      })
      .join('') +
    '</div><p class="battle-table-note">' +
    copy(
      lang,
      '你剩余 ' +
        (5 - state.usedTargets.length) +
        ' 张数字 · 对手剩余 ' +
        state.aiRemaining +
        ' 张 · 每个位置只能使用一次',
      5 -
        state.usedTargets.length +
        ' numbers left for you · ' +
        state.aiRemaining +
        ' for CPU · each position is used once',
    ) +
    '</p>' +
    actionBar(
      selected === null
        ? copy(lang, '请选择一张数字牌。', 'Select a number card.')
        : copy(
            lang,
            '将公开目标 ' + selectedValue + '，然后用完整五张牌成手。',
            'Declare ' + selectedValue + ', then choose a complete five-card hand.',
          ),
      '<button class="button primary" data-action="confirm-target" ' +
        (selected === null ? 'disabled' : '') +
        '>' +
        copy(lang, '确认出牌', 'Confirm number') +
        (selectedValue === null ? '' : ' · ' + selectedValue) +
        ' <span aria-hidden="true">→</span></button>',
    )
  );
}

function upper(state, view) {
  const lang = view.lang;
  const ante = Math.min(state.round, state.playerAir, state.aiAir);
  const candidates = state.candidates.slice(0, 3);
  return (
    targetSlots(state, lang) +
    heading(
      '02 / ' + copy(lang, '完整成手', 'CONSTRUCT'),
      copy(lang, '选择一手牌。', 'Choose your hand.'),
      state.upper.retry
        ? copy(
            lang,
            '双方成手失败。保留目标与底池，重新构造；不重复底注。',
            'Both hands failed. Rebuild with the same targets and pot; no second ante.',
          )
        : copy(
            lang,
            '选择整手五张牌，再确认锁定。A 在点数和中为 1。',
            'Choose all five cards together, then lock. A counts as 1 in the sum.',
          ),
      view.timer,
      lang,
    ) +
    '<div class="battle-candidates">' +
    candidates
      .map((candidate, index) => {
        const selected = index === state.selectedCandidate;
        return (
          '<button type="button" class="battle-candidate' +
          (selected ? ' is-selected' : '') +
          '" data-action="select-candidate" data-index="' +
          index +
          '" data-candidate-index="' +
          index +
          '" aria-pressed="' +
          selected +
          '"><span class="battle-candidate-head"><span class="battle-radio" aria-hidden="true">' +
          (selected ? '●' : '○') +
          '</span><strong>' +
          translate(lang, candidate.rank.key) +
          '</strong><small>0' +
          (index + 1) +
          '</small></span><span class="battle-cards">' +
          candidate.hand.map((card) => cardMarkup(card)).join('') +
          '</span><span class="battle-candidate-foot"><span>' +
          copy(lang, '点数和 ', 'SUM ') +
          candidate.hand.reduce((sum, card) => sum + card.value, 0) +
          '</span><b>' +
          (selected
            ? copy(lang, '暂选 · 尚未锁定', 'SELECTED · UNLOCKED')
            : copy(lang, '选择这手', 'SELECT HAND')) +
          '</b></span></button>'
        );
      })
      .join('') +
    '</div>' +
    (!candidates.length
      ? '<div class="battle-empty"><strong>' +
        copy(lang, '当前数字无法组成合法五张牌。', 'No valid five-card hand for this number.') +
        '</strong><p>' +
        copy(
          lang,
          '提交成手失败，保留所有未用实体牌。数字牌仍已使用。',
          'Submit a failed hand. Unused physical cards are preserved; this number remains used.',
        ) +
        '</p></div>'
      : '') +
    actionBar(
      state.upper.retry
        ? copy(
            lang,
            '本次为重做，底池保留 ' + state.pot + ' AIR。',
            'Retry: the pot stays at ' + state.pot + ' AIR.',
          )
        : copy(
            lang,
            '本次锁定后，双方各投入底注 ' + ante + ' AIR。',
            'Locking starts betting: each side pays an ante of ' + ante + ' AIR.',
          ),
      '<button class="button secondary" data-action="fail-hand" data-attempt="' +
        state.upper.attemptId +
        '">' +
        copy(lang, '主动失败', 'Forfeit hand') +
        '</button>' +
        (candidates.length
          ? '<button class="button primary" data-action="confirm-hand" data-attempt="' +
            state.upper.attemptId +
            '">' +
            copy(lang, '锁定这手牌', 'Lock this hand') +
            ' <span aria-hidden="true">→</span></button>'
          : ''),
    )
  );
}

function betButton(state, move, label, enabled, primary = false) {
  return (
    '<button class="button ' +
    (primary ? 'primary' : 'secondary') +
    (move === 'fold' ? ' battle-fold' : '') +
    '" data-action="bet" data-move="' +
    move +
    '" data-bet="' +
    move +
    '" data-turn="' +
    state.betting.turnId +
    '" ' +
    (!enabled ? 'disabled' : '') +
    '>' +
    label +
    '</button>'
  );
}

function bet(state, view) {
  const lang = view.lang;
  const options = state.legalBets;
  const playerTurn = state.betting.turn === 'player';
  const increment = options.canRaise
    ? Math.min(Math.max(1, Number(view.raiseAmount) || 1), options.maxRaise)
    : 0;
  const paid = options.toCall + (options.canRaise ? increment : 0);
  const hand = state.playerHand;
  const status = state.upper?.playerReason;
  return (
    heading(
      '03 / ' + copy(lang, '交替下注', 'WAGER'),
      playerTurn
        ? copy(lang, '轮到你。', 'Your move.')
        : copy(lang, '对手行动中。', 'Opponent is thinking.'),
      playerTurn
        ? copy(
            lang,
            options.toCall
              ? '应跟 ' + options.toCall + ' AIR。跟注后仍会继续交替行动。'
              : '当前无需跟注。连续两次过牌才结束下注。',
            options.toCall
              ? 'Call ' + options.toCall + ' AIR. Calling passes the action; betting may continue.'
              : 'No call due. Two consecutive checks finish betting.',
          )
        : copy(
            lang,
            '公开金额实时更新；对手成手在摊牌前保持隐藏。',
            'Public amounts update immediately. The opponent’s hand stays hidden until showdown.',
          ),
      playerTurn ? view.timer : undefined,
      lang,
    ) +
    '<div class="battle-duel"><div class="battle-opponent" data-hand="ai"><div class="battle-hand-label"><span>CPU · ' +
    copy(lang, '目标 ', 'TARGET ') +
    '<b data-target-slot="ai">' +
    state.aiTarget +
    '</b></span><span>' +
    copy(lang, '已投 ', 'COMMITTED ') +
    state.aiBet +
    ' AIR</span></div>' +
    backs(lang) +
    '</div><div class="battle-table-line"><span>' +
    copy(lang, '水下牌桌', 'BENEATH THE SURFACE') +
    '</span></div><div class="battle-player" data-hand="player"><div class="battle-hand-label"><span>' +
    copy(lang, '你 · ', 'YOU · ') +
    (hand ? translate(lang, rankHand(hand).key) : copy(lang, '成手失败', 'FAILED HAND')) +
    '</span><span>' +
    copy(lang, '目标 ', 'TARGET ') +
    '<b data-target-slot="player">' +
    state.playerTarget +
    '</b> · ' +
    copy(lang, '已投 ', 'COMMITTED ') +
    state.playerBet +
    ' AIR</span></div>' +
    (hand
      ? '<div class="battle-cards">' + hand.map((card) => cardMarkup(card)).join('') + '</div>'
      : '<div class="battle-failed-hand">' +
        copy(
          lang,
          status === 'timeout' ? '构造超时，实体牌未消耗。' : '本轮成手失败，实体牌未消耗。',
          status === 'timeout'
            ? 'Construction timed out. Physical cards preserved.'
            : 'This hand failed. Physical cards preserved.',
        ) +
        '</div>') +
    '</div></div>' +
    '<footer class="battle-actions battle-betting-actions"><div class="battle-bet-preview"><span>' +
    copy(lang, '应跟 ', 'CALL ') +
    '<b>' +
    options.toCall +
    '</b></span><i>+</i><span>' +
    copy(lang, '再加 ', 'RAISE ') +
    '<b data-preview-increment>' +
    (options.canRaise ? increment : 0) +
    '</b></span><i>=</i><span>' +
    copy(lang, '本次支付 ', 'PAY ') +
    '<b data-preview-payment>' +
    paid +
    '</b> AIR</span><small>' +
    copy(lang, '支付后未开储备 ', 'RESERVE AFTER PAYMENT ') +
    '<b data-preview-reserve>' +
    (state.playerAir - paid) +
    '</b> AIR</small></div><div class="battle-bet-controls"><div class="battle-basic-bets">' +
    (options.toCall > 0
      ? betButton(
          state,
          'call',
          copy(lang, '跟注 · 支付 ', 'Call · pay ') + options.toCall,
          options.canCall,
          !options.canRaise,
        )
      : betButton(
          state,
          'check',
          copy(lang, '过牌 · 支付 0', 'Check · pay 0'),
          options.canCheck,
          !options.canRaise,
        )) +
    betButton(state, 'fold', copy(lang, '弃牌', 'Fold'), options.canFold) +
    '</div><div class="battle-raise-control"><label for="raiseAmount">' +
    copy(lang, '再加', 'Raise by') +
    ' <input id="raiseAmount" type="number" inputmode="numeric" min="' +
    (options.canRaise ? 1 : 0) +
    '" max="' +
    Math.max(1, options.maxRaise) +
    '" step="1" value="' +
    increment +
    '" ' +
    (!options.canRaise ? 'disabled' : '') +
    '></label><button class="battle-max" data-action="max-raise" ' +
    (!options.canRaise ? 'disabled' : '') +
    '>' +
    copy(lang, '最大 ', 'MAX ') +
    options.maxRaise +
    '</button>' +
    betButton(
      state,
      'raise',
      '<span data-raise-label>' + copy(lang, '加注 · 支付 ', 'Raise · pay ') + paid + '</span>',
      options.canRaise,
      true,
    ) +
    '</div></div><div class="battle-bet-hint"><span>' +
    copy(
      lang,
      '再加上限 ' + options.maxRaise + ' AIR · 先跟齐，再加至多半池。',
      'Raise limit ' + options.maxRaise + ' AIR · call first, then add at most half the pot.',
    ) +
    '</span>' +
    (options.canAllIn
      ? betButton(
          state,
          'all-in',
          copy(lang, '合法全押 · 支付 ', 'Legal all-in · pay ') + options.allInCost,
          true,
        )
      : '') +
    '</div>' +
    (playerTurn
      ? '<p class="battle-timeout-note">' +
        copy(
          lang,
          options.toCall > 0 ? '行动超时将自动弃牌。' : '行动超时将自动过牌。',
          options.toCall > 0 ? 'Timeout folds automatically.' : 'Timeout checks automatically.',
        ) +
        '</p>'
      : '') +
    '</footer>'
  );
}

function decisiveValue(result) {
  if (!result.playerRank || !result.aiRank || result.folded || result.winner === 'tie') return null;
  if (result.playerRank.category !== result.aiRank.category) return null;
  const left = result.playerRank.tie;
  const right = result.aiRank.tie;
  const index = left.findIndex((value, i) => value !== right[i]);
  return index < 0 ? null : { player: left[index], ai: right[index] };
}

function showdown(state, view) {
  const lang = view.lang;
  const result = state.lastResult;
  const tie = result.winner === 'tie';
  const calamity =
    result.calamity &&
    !tie &&
    !result.folded &&
    !result.upperFailed.player &&
    !result.upperFailed.ai;
  const overlap = new Set(calamity ? result.overlap.map((card) => card.id) : []);
  const decisive = decisiveValue(result);
  const hand = (actor) => {
    const cards = state[actor + 'Hand'];
    const rank = result[actor + 'Rank'];
    const folded = result.foldedBy === actor;
    return (
      '<section class="battle-reveal-hand' +
      (result.winner === actor ? ' is-winner' : '') +
      '" data-hand="' +
      actor +
      '"><div class="battle-hand-label"><strong>' +
      (actor === 'player' ? copy(lang, '你', 'YOU') : 'CPU') +
      ' · ' +
      (folded
        ? copy(lang, '已弃牌', 'FOLDED')
        : rank
          ? translate(lang, rank.key)
          : copy(lang, '成手失败', 'FAILED HAND')) +
      '</strong><span>' +
      copy(lang, '目标 ', 'TARGET ') +
      state[actor + 'Target'] +
      '</span></div>' +
      (folded
        ? backs(lang)
        : cards
          ? '<div class="battle-cards" data-reveal="' +
            actor +
            '">' +
            cards
              .map((card) =>
                cardMarkup(card, {
                  overlap: overlap.has(card.id),
                  key: Boolean(
                    decisive && (card.value === 1 ? 14 : card.value) === decisive[actor],
                  ),
                }),
              )
              .join('') +
            '</div>'
          : '<div class="battle-failed-hand">' +
            copy(lang, '没有有效成手 · 实体牌未消耗', 'No valid hand · physical cards preserved') +
            '</div>') +
      '</section>'
    );
  };
  const title = tie
    ? copy(lang, '本轮平手。', 'Round tied.')
    : result.winner === 'player'
      ? copy(lang, '你赢下本轮。', 'You take the round.')
      : copy(lang, '对手赢下本轮。', 'Opponent takes the round.');
  const reason = result.folded
    ? copy(
        lang,
        (result.foldedBy === 'player' ? '你' : '对手') + '弃牌，底池归另一方；不触发灾厄。',
        (result.foldedBy === 'player' ? 'You' : 'CPU') +
          ' folded. The other side receives the pot; no calamity.',
      )
    : result.upperFailed.player || result.upperFailed.ai
      ? copy(
          lang,
          '一方成手失败，底池归有效成手方；不触发灾厄。',
          'One hand failed. The valid hand receives the pot; no calamity.',
        )
      : tie
        ? copy(
            lang,
            '牌型与比较值相同，双方退回各自投入。',
            'Equal ranks and comparison values. Each side receives its own stake back.',
          )
        : decisive
          ? copy(
              lang,
              '同牌型按比较序列决定胜负；细框标出本次决定比较的牌。',
              'Equal categories: comparison values break the tie. Outlined cards decide it.',
            )
          : copy(
              lang,
              '按双方完整五张牌的牌型比较。',
              'The stronger complete five-card poker hand wins.',
            );
  const face = (value) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[value] ?? String(value);
  const comparison = decisive
    ? copy(
        lang,
        '本次决定比较：你 ' + face(decisive.player) + ' / CPU ' + face(decisive.ai) + '。',
        'Deciding value: you ' + face(decisive.player) + ' / CPU ' + face(decisive.ai) + '.',
      )
    : !result.folded && result.playerRank && result.aiRank && !tie
      ? copy(lang, '牌型比较：你 ', 'Categories: you ') +
        translate(lang, result.playerRank.key) +
        ' / CPU ' +
        translate(lang, result.aiRank.key) +
        '.'
      : '';
  const row = (label, player, ai) =>
    '<div class="battle-ledger-row"><span>' +
    label +
    '</span><b>' +
    player +
    '</b><b>' +
    ai +
    '</b></div>';
  // Net committed stakes cannot reconstruct earlier unmatched refunds. Use the
  // recorded round ledger when supplied by the application.
  const totals =
    view.roundRecord?.number === state.round && view.roundRecord.status === 'settled'
      ? view.roundRecord.totals
      : null;
  const committed = (actor) =>
    totals ? totals[actor].ante + totals[actor].bet : state[actor + 'Bet'];
  const payout = (actor) =>
    totals ? totals[actor].received : !tie && result.winner === actor ? result.pot : 0;
  const refund = (actor) => (totals ? totals[actor].refunded : tie ? state[actor + 'Bet'] : 0);
  const burned = (actor) =>
    totals ? totals[actor].burned : !tie && result.winner !== actor ? result.burned : 0;
  const net = (actor) =>
    totals ? totals[actor].net : payout(actor) + refund(actor) - committed(actor) - burned(actor);
  const next =
    state.completedRounds >= state.maxRounds || Math.min(state.playerAir, state.aiAir) <= 0;
  return (
    heading('04 / ' + copy(lang, '摊牌', 'REVEAL'), title, reason, undefined, lang) +
    '<div class="battle-showdown">' +
    hand('ai') +
    hand('player') +
    '</div>' +
    (comparison ? '<p class="battle-comparison">' + comparison + '</p>' : '') +
    (calamity
      ? '<div class="battle-calamity" data-calamity data-burned><strong>' +
        copy(
          lang,
          '灾厄 · 相同实体牌 ' + overlap.size + ' 张',
          'CALAMITY · ' + overlap.size + ' identical physical cards',
        ) +
        '</strong><span>' +
        copy(
          lang,
          '额外实际烧毁 ' + result.burned + ' AIR',
          'Actual additional loss: ' + result.burned + ' AIR',
        ) +
        '</span></div>'
      : '') +
    '<div class="battle-ledger" aria-label="' +
    copy(lang, '本轮账目', 'Round ledger') +
    '"><div class="battle-ledger-row battle-ledger-head"><strong>' +
    copy(lang, '本轮账目 · AIR', 'ROUND LEDGER · AIR') +
    '</strong><span>' +
    copy(lang, '你', 'YOU') +
    '</span><span>CPU</span></div>' +
    row(
      copy(
        lang,
        totals ? '累计投入' : '结算时投入',
        totals ? 'Total committed' : 'Stakes at settlement',
      ),
      committed('player'),
      committed('ai'),
    ) +
    row(copy(lang, '底池收款', 'Pot received'), payout('player'), payout('ai')) +
    row(copy(lang, '退款', 'Refund'), refund('player'), refund('ai')) +
    row(copy(lang, '灾厄烧毁', 'Burned'), burned('player'), burned('ai')) +
    (totals
      ? row(copy(lang, '呼吸开罐', 'Breathing cans'), totals.player.breathing, totals.ai.breathing)
      : '') +
    row(copy(lang, '本轮净变化', 'Round net change'), signed(net('player')), signed(net('ai'))) +
    '</div>' +
    actionBar(
      copy(
        lang,
        totals
          ? '本轮净变化 = 收款 + 退款 − 投入 − 烧毁 − 呼吸开罐。'
          : '此处为结算时投入与变化；完整记录还包含先前退款和呼吸开罐。',
        totals
          ? 'Round net = received + refunds − committed − burned − breathing.'
          : 'These are settlement stakes and changes; the full record includes earlier refunds and breathing.',
      ),
      '<button class="button secondary" data-action="open-record">' +
        copy(lang, '查看账目', 'View record') +
        '</button><button class="button primary" data-action="advance-round">' +
        copy(lang, next ? '进入耐息' : '下一回合', next ? 'Enter endurance' : 'Next round') +
        ' →</button>',
    )
  );
}

function endurance(state, view) {
  const lang = view.lang;
  const reasons = {
    'round-limit': [
      '五轮已结束，等待实际生存结果。',
      'Five rounds completed. Survival determines the result.',
    ],
    'no-betting-air': [
      '未开储备不足以继续下注，进入耐息。',
      'There is not enough unopened AIR to continue betting.',
    ],
    'upper-deadlock': [
      '双方数字均无解，底池已退回，进入耐息。',
      'Neither target can form a hand. Stakes refunded; endurance begins.',
    ],
  };
  const reason = reasons[state.enduranceReason] ?? reasons['round-limit'];
  return (
    heading(
      '05 / ' + copy(lang, '耐息', 'ENDURANCE'),
      copy(lang, '守住下一口空气。', 'Hold on to the next breath.'),
      copy(lang, ...reason),
      undefined,
      lang,
    ) +
    '<div class="battle-endurance">' +
    ['player', 'ai']
      .map(
        (actor) =>
          '<section class="battle-endurance-person"><span class="eyebrow">' +
          (actor === 'player' ? copy(lang, '你', 'YOU') : 'CPU') +
          '</span><div class="battle-canister" aria-hidden="true"><i data-supply-level="' +
          actor +
          '" style="height:' +
          supplyRatio(state, actor) * 100 +
          '%"></i><span>AIR</span></div><strong data-breath="' +
          actor +
          '">' +
          supplyText(state, actor, lang) +
          '</strong><span>' +
          copy(lang, '未开储备 ', 'UNOPENED ') +
          state[actor + 'Air'] +
          ' AIR</span><progress data-supply-progress="' +
          actor +
          '" max="1" value="' +
          supplyRatio(state, actor) +
          '" aria-label="' +
          (actor === 'player'
            ? copy(lang, '你的供气', 'Your supply')
            : copy(lang, '对手供气', 'CPU supply')) +
          '"></progress></section>',
      )
      .join('') +
    '</div>' +
    actionBar(
      copy(
        lang,
        '未开储备为零时，当前罐仍可供气。也可以留在这里等待。',
        'Zero unopened AIR does not end current supply. You may also wait here.',
      ),
      '<button class="button primary" data-action="fast-forward">' +
        copy(lang, '快进到生存结果', 'Fast-forward to survival result') +
        ' →</button>',
    )
  );
}

export function battleMarkup(state, view) {
  const content = { lower, upper, bet, showdown, endurance }[state.phase];
  return (
    '<section class="battle" data-phase="' +
    esc(state.phase) +
    '">' +
    resources(state, view.lang) +
    '<div class="battle-table">' +
    (content ? content(state, view) : '') +
    '</div><div class="battle-bottom-note"><span>' +
    copy(view.lang, '共享实体牌剩余 ', 'PHYSICAL CARDS LEFT ') +
    state.deck +
    ' / 52</span><button data-action="open-discard">' +
    copy(view.lang, '查看已用牌 ', 'Used cards ') +
    state.discard.length +
    ' ↗</button></div></section>'
  );
}

export function updateBattleBreathing(document, state, lang) {
  for (const actor of ['player', 'ai']) {
    document.querySelectorAll('[data-breath="' + actor + '"]').forEach((node) => {
      node.textContent = supplyText(state, actor, lang);
      node.classList.toggle('is-shortage', state.respiration[actor].remainingMs <= 0);
    });
    document.querySelectorAll('[data-supply-level="' + actor + '"]').forEach((node) => {
      node.style.height = supplyRatio(state, actor) * 100 + '%';
    });
    document.querySelectorAll('[data-supply-progress="' + actor + '"]').forEach((node) => {
      node.value = supplyRatio(state, actor);
    });
  }
}

export function updateBetPreview(document, state, lang) {
  if (state.phase !== 'bet') return;
  const input = document.getElementById('raiseAmount');
  if (!input) return;
  const valid = input.checkValidity() && Number.isInteger(Number(input.value));
  const increment = state.legalBets.canRaise ? Number(input.value) : 0;
  const paid = state.legalBets.toCall + increment;
  const set = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  };
  set('[data-preview-increment]', valid || !state.legalBets.canRaise ? increment : '—');
  set('[data-preview-payment]', valid || !state.legalBets.canRaise ? paid : '—');
  set('[data-preview-reserve]', valid || !state.legalBets.canRaise ? state.playerAir - paid : '—');
  set('[data-raise-label]', copy(lang, '加注 · 支付 ', 'Raise · pay ') + (valid ? paid : '—'));
  const button = document.querySelector('[data-action="bet"][data-move="raise"]');
  if (button) button.disabled = !state.legalBets.canRaise || !valid;
}

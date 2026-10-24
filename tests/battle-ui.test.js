import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game/engine.js';
import { battleMarkup, cardMarkup } from '../ui/battle.js';
import { CANISTER_MS } from '../game/breathing.js';

const view = { lang: 'zh', timer: 30, selectedTarget: null };
function constructedGame() {
  const game = createGame({ random: () => 0.41 });
  game.dispatch({ type: 'choose-target', index: 0 });
  const state = game.getState();
  game.dispatch({ type: 'confirm-hand', attemptId: state.upper.attemptId });
  return game;
}
function finishBetting(game) {
  for (let index = 0; index < 100 && game.getState().phase === 'bet'; index += 1) {
    const state = game.getState();
    game.dispatch(
      state.betting.turn === 'ai'
        ? { type: 'cpu-bet', turnId: state.betting.turnId }
        : {
            type: 'bet',
            action: state.legalBets.canCall ? 'call' : 'check',
            turnId: state.betting.turnId,
          },
    );
  }
  return game.getState();
}

test('number preview is local and preserves duplicate-position identity and unused state', () => {
  const game = createGame({ random: () => 0.41 });
  const state = game.getState();
  const before = structuredClone(state);
  const html = battleMarkup(state, { ...view, selectedTarget: 2 });
  assert.match(html, /data-target-index="2" aria-pressed="true"/);
  assert.match(html, /data-action="confirm-target"/);
  assert.equal((html.match(/data-target-index=/g) || []).length, 5);
  assert.deepEqual(state, before);
  assert.deepEqual(game.getState(), before);
});

test('candidate options show all five public cards and a guarded lock action', () => {
  const game = createGame({ random: () => 0.41 });
  game.dispatch({ type: 'choose-target', index: 0 });
  const state = game.getState();
  const html = battleMarkup(state, view);
  assert.equal((html.match(/data-card-id=/g) || []).length, state.candidates.length * 5);
  assert.match(
    html,
    new RegExp('data-action="confirm-hand" data-attempt="' + state.upper.attemptId + '"'),
  );
  assert.match(html, /双方各投入底注 1 AIR/);
  assert.ok(!html.includes('SCORE'));
});

test('betting never renders CPU card identities and previews call plus raise', () => {
  const game = constructedGame();
  let state = game.getState();
  if (state.betting.turn === 'ai') {
    game.dispatch({ type: 'cpu-bet', turnId: state.betting.turnId });
    state = game.getState();
  }
  assert.equal(state.phase, 'bet');
  assert.equal(state.betting.turn, 'player');
  state.aiHand = [{ id: 'secret-never-in-dom', rank: 'SECRET', suit: '?', value: 13 }];
  const increment = Math.min(2, state.legalBets.maxRaise);
  const html = battleMarkup(state, { ...view, raiseAmount: increment });
  assert.ok(!html.includes('secret-never-in-dom'));
  assert.ok(!html.includes('SECRET'));
  assert.match(html, /五张未公开的牌/);
  assert.match(
    html,
    new RegExp('data-preview-payment>' + (state.legalBets.toCall + increment) + '</b>'),
  );
  assert.match(
    html,
    new RegExp(
      'data-preview-reserve>' + (state.playerAir - state.legalBets.toCall - increment) + '</b>',
    ),
  );
  assert.match(html, new RegExp('data-turn="' + state.betting.turnId + '"'));
});

test('showdown reports actual settlement and only highlights identical physical cards', () => {
  const state = finishBetting(constructedGame());
  assert.equal(state.phase, 'showdown');
  const html = battleMarkup(state, view);
  assert.match(html, /本轮净变化/);
  assert.match(html, /底池收款/);
  assert.match(html, /完整记录还包含先前退款和呼吸开罐/);
  const result = state.lastResult;
  if (result.calamity && result.winner !== 'tie') {
    assert.match(html, new RegExp('额外实际烧毁 ' + result.burned + ' AIR'));
    assert.equal((html.match(/is-overlap/g) || []).length, result.overlap.length * 2);
  } else assert.ok(!html.includes('data-calamity'));
});

test('card face labels are escaped, including attribute values', () => {
  const html = cardMarkup({
    id: '" onmouseover="bad',
    rank: '<b>',
    suit: '&',
    value: 1,
    red: false,
  });
  assert.ok(!html.includes('<b>'));
  assert.match(html, /&quot; onmouseover=&quot;bad/);
  assert.match(html, /&lt;b&gt;/);
});

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function lock(game, failed = false) {
  game.dispatch({
    type: failed ? 'fail-hand' : 'confirm-hand',
    attemptId: game.getState().upper.attemptId,
  });
}
function ledgerRows(html) {
  return new Map(
    [
      ...html.matchAll(
        /class="battle-ledger-row"><span>([^<]+)<\/span><b>([^<]+)<\/b><b>([^<]+)<\/b>/g,
      ),
    ].map((match) => [match[1], [Number(match[2]), Number(match[3])]]),
  );
}
function assertRecordedLedger(game) {
  const state = game.getState();
  const roundRecord = game.getRecord().rounds.find((round) => round.number === state.round);
  const html = battleMarkup(state, { ...view, roundRecord });
  const rows = ledgerRows(html);
  for (const [label, value] of [
    ['累计投入', (total) => total.ante + total.bet],
    ['底池收款', (total) => total.received],
    ['退款', (total) => total.refunded],
    ['灾厄烧毁', (total) => total.burned],
    ['呼吸开罐', (total) => total.breathing],
    ['本轮净变化', (total) => total.net],
  ])
    assert.deepEqual(
      rows.get(label),
      ['player', 'ai'].map((actor) => value(roundRecord.totals[actor])),
      label,
    );
  for (const actor of ['player', 'ai']) {
    assert.equal(
      roundRecord.totals[actor].net,
      roundRecord.airAfter[actor] - roundRecord.airBefore[actor],
    );
  }
  assert.match(html, new RegExp('共享实体牌剩余 ' + state.deck + ' / 52'));
  assert.match(html, new RegExp('查看已用牌 ' + state.discard.length));
  return html;
}

test('round ledger includes earlier unmatched refunds and breathing rather than only net stakes', () => {
  let covered = false;
  for (let seed = 1; seed <= 20 && !covered; seed++) {
    const game = createGame({ random: seeded(seed) });
    const sessionId = game.getState().sessionId;
    game.dispatch({ type: 'elapse', sessionId, elapsedMs: CANISTER_MS - 1 });
    game.dispatch({ type: 'choose-target', index: 0 });
    lock(game);
    for (let turn = 0; turn < 100 && game.getState().phase === 'bet'; turn++) {
      const state = game.getState();
      if (Math.min(state.playerAir, state.aiAir) === 0 && state.playerBet !== state.aiBet) {
        covered = true;
        game.dispatch({ type: 'elapse', sessionId, elapsedMs: CANISTER_MS });
        finishBetting(game);
        const html = assertRecordedLedger(game);
        const rows = ledgerRows(html);
        assert.ok(rows.get('退款').some((value) => value > 0));
        assert.deepEqual(rows.get('呼吸开罐'), [1, 1]);
        assert.ok(html.includes('收款 + 退款 − 投入 − 烧毁 − 呼吸开罐'));
        break;
      }
      game.dispatch(
        state.betting.turn === 'ai'
          ? { type: 'cpu-bet', turnId: state.betting.turnId }
          : {
              type: 'bet',
              turnId: state.betting.turnId,
              action: state.legalBets.canRaise
                ? 'raise'
                : state.legalBets.canCall
                  ? 'call'
                  : 'check',
              amount: state.legalBets.maxRaise,
            },
      );
    }
  }
  assert.equal(covered, true);
});

test('tie refunds, folds and burns retain distinct ledger semantics', () => {
  const tied = createGame({ random: seeded(24) });
  tied.dispatch({ type: 'choose-target', index: 2 });
  lock(tied);
  finishBetting(tied);
  assert.equal(tied.getState().lastResult.winner, 'tie');
  const tieHtml = assertRecordedLedger(tied);
  assert.ok(!tieHtml.includes('data-calamity'));
  assert.deepEqual(ledgerRows(tieHtml).get('底池收款'), [0, 0]);
  assert.deepEqual(ledgerRows(tieHtml).get('本轮净变化'), [0, 0]);
  let burned = false;
  let folded = false;
  for (let seed = 1; seed <= 8; seed++) {
    const game = createGame({ random: seeded(seed) });
    while (game.getState().phase === 'lower') {
      game.dispatch({ type: 'choose-target', index: game.getState().targetPlayable.indexOf(true) });
      lock(game);
      for (let turn = 0; turn < 100 && game.getState().phase === 'bet'; turn++) {
        const state = game.getState();
        game.dispatch(
          state.betting.turn === 'ai'
            ? { type: 'cpu-bet', turnId: state.betting.turnId }
            : {
                type: 'bet',
                action: seed % 2 === 0 ? 'fold' : state.legalBets.canCall ? 'call' : 'check',
                turnId: state.betting.turnId,
              },
        );
      }
      const state = game.getState();
      if (state.phase !== 'showdown') break;
      const html = assertRecordedLedger(game);
      if (state.lastResult.burned > 0) {
        burned = true;
        assert.ok(html.includes('data-calamity'));
      }
      if (state.lastResult.folded) {
        folded = true;
        assert.ok(!html.includes('data-calamity'));
      }
      game.dispatch({ type: 'advance-round' });
    }
  }
  assert.equal(burned, true);
  assert.equal(folded, true);
});

test('retry preserves the pot and candidate selection, CPU turn cannot show a phantom raise', () => {
  const game = createGame({ random: seeded(1) });
  for (let round = 1; round <= 5; round++) {
    game.dispatch({
      type: 'choose-target',
      index: game.getState().targetPlayable.lastIndexOf(true),
    });
    if (round === 5) game.dispatch({ type: 'select-candidate', index: 1 });
    lock(game, round === 5);
    finishBetting(game);
    if (round < 5) game.dispatch({ type: 'advance-round' });
  }
  const retry = game.getState();
  assert.equal(retry.upper.retry, true);
  const html = battleMarkup(retry, view);
  assert.match(html, /本次为重做，底池保留 10 AIR/);
  assert.ok(!html.includes('双方各投入底注'));
  assert.match(
    html,
    new RegExp('data-candidate-index="' + retry.selectedCandidate + '" aria-pressed="true"'),
  );
  lock(game);
  assertRecordedLedger(game);
  const cpu = constructedGame();
  let state = cpu.getState();
  if (state.betting.turn === 'player')
    cpu.dispatch({ type: 'bet', action: 'check', turnId: state.betting.turnId });
  state = cpu.getState();
  assert.equal(state.betting.turn, 'ai');
  const cpuHtml = battleMarkup(state, view);
  assert.match(cpuHtml, /data-preview-increment>0<\/b>/);
  assert.match(cpuHtml, /id="raiseAmount"[^>]*value="0" disabled/);
  assert.ok(
    [...cpuHtml.matchAll(/<button[^>]*data-action="bet"[^>]*>/g)].every((match) =>
      match[0].includes('disabled'),
    ),
  );
});

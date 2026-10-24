import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { createDeck, judgeHand, makeCandidates } from '../game/cards.js';
import { CANISTER_MS, HYPOXIA_MS } from '../game/breathing.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function choose(game, index = game.getState().targetPlayable.indexOf(true)) {
  assert.equal(game.dispatch({ type: 'choose-target', index }), true);
}
function lock(game, type = 'confirm-hand', hand) {
  return game.dispatch({ type, attemptId: game.getState().upper.attemptId, hand });
}
function pass(game) {
  let count = 0;
  while (game.getState().phase === 'bet') {
    const state = game.getState();
    assert.equal(
      game.dispatch(
        state.betting.turn === 'ai'
          ? { type: 'cpu-bet', turnId: state.betting.turnId }
          : {
              type: 'bet',
              action: state.legalBets.canCall ? 'call' : 'check',
              turnId: state.betting.turnId,
            },
      ),
      true,
    );
    assert.ok(++count < 100);
  }
}
function inert(game, action) {
  const before = game.getState();
  assert.equal(game.dispatch(action), false);
  assert.deepEqual(game.getState(), before);
}

test('hand judging rejects fabricated, duplicate, used, partial and wrong-sum cards', () => {
  const hand = makeCandidates(35)[0].hand;
  assert.equal(judgeHand(hand, 35).valid, true);
  for (const [cards, target, discard, reason] of [
    [hand.slice(1), 35, [], 'incomplete'],
    [[...hand.slice(0, 4), hand[0]], 35, [], 'duplicate'],
    [hand, 35, [hand[0]], 'used-card'],
    [hand, 36, [], 'wrong-sum'],
    [[{ ...hand[0], value: 99 }, ...hand.slice(1)], 35, [], 'unknown-card'],
    [[{ id: '100-8' }, ...hand.slice(1)], 35, [], 'unknown-card'],
  ])
    assert.equal(judgeHand(cards, target, discard).reason, reason);
});

test('a submitted invalid hand loses only its actual stake and preserves its physical cards', () => {
  const game = createGame({ random: seeded(1) });
  choose(game);
  const state = game.getState();
  const oldAttempt = state.upper.attemptId;
  inert(game, { type: 'confirm-hand' });
  inert(game, { type: 'submit-hand', attemptId: oldAttempt, hand: 'invalid request' });
  assert.equal(lock(game, 'submit-hand', createDeck().slice(0, 4)), true);
  assert.equal(game.getState().playerHand, null);
  pass(game);
  const result = game.getState();
  assert.equal(result.lastResult.winner, 'ai');
  assert.equal(result.lastResult.upperFailed.player, true);
  assert.equal(result.lastResult.calamity, false);
  assert.equal(result.lastResult.burned, 0);
  assert.equal(result.discard.length, 5);
  assert.equal(result.playerAir + result.aiAir + result.breathSpent, 50);
  inert(game, { type: 'upper-timeout', attemptId: oldAttempt });
});

test('construct timeout and deliberate failure lock once, and old attempts cannot cross reset', () => {
  const game = createGame({ random: seeded(7) });
  choose(game);
  const attemptId = game.getState().upper.attemptId;
  assert.equal(lock(game, 'upper-timeout'), true);
  assert.equal(game.getState().upper.playerReason, 'timeout');
  inert(game, { type: 'upper-timeout', attemptId });
  game.reset();
  choose(game);
  assert.ok(game.getState().upper.attemptId > attemptId);
  inert(game, { type: 'confirm-hand', attemptId });
  inert(game, { type: 'fail-hand', attemptId });
  assert.equal(lock(game, 'fail-hand'), true);
  assert.equal(game.getState().upper.playerReason, 'forfeited');
});

test('both failed hands rebuild the same round and pot, with no extra ante or discarded cards', () => {
  const game = createGame({ random: seeded(1) });
  for (let round = 1; round <= 5; round++) {
    const before = game.getState();
    choose(game, before.targetPlayable.lastIndexOf(true));
    if (round < 5) {
      lock(game);
      pass(game);
      assert.equal(game.dispatch({ type: 'advance-round' }), true);
      continue;
    }
    const firstAttempt = game.getState().upper.attemptId;
    lock(game, 'fail-hand');
    pass(game);
    const retry = game.getState();
    assert.equal(retry.phase, 'upper');
    assert.equal(retry.upper.retry, true);
    assert.equal(retry.upper.attempt, 2);
    assert.equal(retry.completedRounds, 4);
    assert.equal(retry.usedTargets.length, 5);
    assert.deepEqual(retry.discard, before.discard);
    assert.equal(retry.pot, 10);
    assert.equal(retry.playerBet, 5);
    assert.equal(retry.aiBet, 5);
    const history = retry.betting.history;
    inert(game, { type: 'confirm-hand', attemptId: firstAttempt });
    lock(game);
    const after = game.getState();
    assert.equal(after.completedRounds, 5);
    assert.equal(after.lastResult.winner, 'player');
    assert.equal(after.lastResult.upperFailed.ai, true);
    assert.equal(after.lastResult.pot, retry.pot);
    assert.equal(after.discard.length, retry.discard.length + 5);
    assert.deepEqual(after.betting.history, history);
    assert.equal(after.playerAir + after.aiAir + after.breathSpent, 50);
  }
});

test('mathematically impossible numbers remain selectable and a double deadlock refunds into endurance', () => {
  const game = createGame({ random: seeded(98) });
  for (let round = 1; round <= 5; round++) {
    const before = game.getState();
    const index = before.targetPlayable.indexOf(true);
    if (round === 5) assert.equal(before.targetSolvable[index], false);
    choose(game, index);
    lock(game);
    pass(game);
    const after = game.getState();
    if (round < 5) game.dispatch({ type: 'advance-round' });
    else {
      assert.equal(after.phase, 'endurance');
      assert.equal(after.enduranceReason, 'upper-deadlock');
      assert.equal(after.completedRounds, 4);
      assert.equal(after.pot, 0);
      assert.deepEqual(after.discard, before.discard);
      assert.equal(
        after.playerAir + after.aiAir + after.breathSpent,
        before.playerAir + before.aiAir + before.breathSpent,
      );
    }
  }
});

test('real elapsed time is absolute, refuses stale sessions and ends on actual supply exhaustion', () => {
  const game = createGame({ random: seeded(2) });
  let state = game.getState();
  assert.equal(state.playerAir, 24);
  inert(game, { type: 'elapse', sessionId: state.sessionId, elapsedMs: 0 });
  for (const elapsedMs of [-1, 0.5, NaN, Infinity])
    inert(game, { type: 'elapse', sessionId: state.sessionId, elapsedMs });
  assert.equal(
    game.dispatch({ type: 'elapse', sessionId: state.sessionId, elapsedMs: CANISTER_MS }),
    true,
  );
  assert.equal(game.getState().playerAir, 23);
  inert(game, { type: 'elapse', sessionId: state.sessionId, elapsedMs: CANISTER_MS });
  game.reset();
  inert(game, { type: 'elapse', sessionId: state.sessionId, elapsedMs: 1000000 });
  state = game.getState();
  game.dispatch({ type: 'elapse', sessionId: state.sessionId, elapsedMs: 25 * CANISTER_MS });
  assert.equal(game.getState().phase, 'endurance');
  assert.equal(game.getState().playerAir, 0);
  game.dispatch({
    type: 'elapse',
    sessionId: state.sessionId,
    elapsedMs: 25 * CANISTER_MS + HYPOXIA_MS,
  });
  assert.equal(game.getState().phase, 'summary');
  assert.equal(game.getState().winner, 'tie');
  assert.equal(game.getState().breathSpent, 50);
});

test('opening the last canister enters endurance before a zero-stake round can start', () => {
  for (const phase of ['lower', 'upper']) {
    const game = createGame({ random: seeded(2) });
    const before = game.getState();
    if (phase === 'upper') {
      game.dispatch({
        type: 'elapse',
        sessionId: before.sessionId,
        elapsedMs: 24 * CANISTER_MS - 1,
      });
      choose(game);
    }
    game.dispatch({ type: 'elapse', sessionId: before.sessionId, elapsedMs: 24 * CANISTER_MS });
    const after = game.getState();
    assert.equal(after.phase, 'endurance');
    assert.equal(after.enduranceReason, 'no-betting-air');
    assert.equal(after.winner, null);
    assert.equal(after.completedRounds, 0);
    assert.equal(after.pot, 0);
    assert.equal(after.respiration.player.remainingMs, CANISTER_MS);
    assert.equal(after.playerAir + after.aiAir + after.breathSpent, 50);
    inert(game, { type: 'choose-target', index: 0 });
    inert(game, { type: 'confirm-hand', attemptId: after.upper?.attemptId });
  }
});

test('long background elapsed time processes hand and betting deadlines before supply exhaustion', () => {
  const game = createGame({ random: seeded(3) });
  choose(game);
  const before = game.getState();
  game.dispatch({ type: 'elapse', sessionId: before.sessionId, elapsedMs: 999999999 });
  const after = game.getState();
  assert.equal(after.phase, 'summary');
  assert.equal(after.completedRounds, 1);
  assert.equal(after.pot, 0);
  assert.equal(after.playerAir + after.aiAir + after.breathSpent, 50);
  assert.equal(after.respiration.elapsedMs, 24 * CANISTER_MS + HYPOXIA_MS);
});

test('a single background jump equals small time steps across construction and CPU actions', () => {
  const games = [createGame({ random: seeded(7) }), createGame({ random: seeded(7) })];
  for (const game of games) choose(game);
  const sessionId = games[0].getState().sessionId;
  games[0].dispatch({ type: 'elapse', sessionId, elapsedMs: 100000 });
  for (let elapsedMs = 1000; elapsedMs <= 100000; elapsedMs += 1000)
    games[1].dispatch({ type: 'elapse', sessionId, elapsedMs });
  assert.deepEqual(games[0].getState(), games[1].getState());
});

test('a breathing refill returns unmatched excess without wagering opened AIR', () => {
  let covered = false;
  for (let seed = 1; seed <= 20 && !covered; seed++) {
    const game = createGame({ random: seeded(seed) });
    const sessionId = game.getState().sessionId;
    game.dispatch({ type: 'elapse', sessionId, elapsedMs: CANISTER_MS - 1 });
    choose(game);
    lock(game);
    let turns = 0;
    while (game.getState().phase === 'bet') {
      const before = game.getState();
      if (Math.min(before.playerAir, before.aiAir) === 0 && before.playerBet !== before.aiBet) {
        covered = true;
        game.dispatch({ type: 'elapse', sessionId, elapsedMs: CANISTER_MS });
        const after = game.getState();
        assert.equal(after.phase, 'bet');
        assert.equal(after.pot, before.pot - 1);
        assert.equal(
          Math.max(after.playerBet, after.aiBet),
          Math.max(before.playerBet, before.aiBet) - 1,
        );
        assert.equal(after.breathSpent, 4);
        assert.ok(
          game
            .getRecord()
            .ledger.some((entry) => entry.reason === 'unmatched-refund' && entry.amount === 1),
        );
        assert.equal(game.getRecord().accounts.pot, after.pot);
        assert.equal(game.getRecord().accounts.player, after.playerAir);
        assert.equal(game.getRecord().accounts.ai, after.aiAir);
        assert.equal(after.playerAir + after.aiAir + after.breathSpent + after.pot, 50);
        assert.equal(after.respiration.player.remainingMs, CANISTER_MS);
        assert.equal(after.respiration.ai.remainingMs, CANISTER_MS);
        pass(game);
        assert.equal(game.getState().phase, 'showdown');
        break;
      }
      game.dispatch(
        before.betting.turn === 'ai'
          ? { type: 'cpu-bet', turnId: before.betting.turnId }
          : {
              type: 'bet',
              turnId: before.betting.turnId,
              action: before.legalBets.canRaise
                ? 'raise'
                : before.legalBets.canCall
                  ? 'call'
                  : 'check',
              amount: before.legalBets.maxRaise,
            },
      );
      assert.ok(++turns < 100);
    }
  }
  assert.equal(covered, true);
});

test('endurance fast-forward and actual elapsed time produce identical survival results', () => {
  const games = [createGame({ random: seeded(1) }), createGame({ random: seeded(1) })];
  for (const game of games) {
    for (let round = 1; round <= 5; round++) {
      choose(game, game.getState().targetPlayable.lastIndexOf(true));
      lock(game);
      pass(game);
      game.dispatch({ type: 'advance-round' });
    }
    assert.equal(game.getState().phase, 'endurance');
    assert.equal(game.getState().winner, null);
  }
  const fast = games[0].getState();
  assert.equal(games[0].dispatch({ type: 'fast-forward', sessionId: fast.sessionId }), true);
  games[1].dispatch({ type: 'elapse', sessionId: fast.sessionId, elapsedMs: 999999999 });
  assert.deepEqual(games[0].getState(), games[1].getState());
  inert(games[0], { type: 'fast-forward', sessionId: fast.sessionId });
});

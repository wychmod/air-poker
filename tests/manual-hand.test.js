import assert from 'node:assert/strict';
import test from 'node:test';
import { card } from '../game/cards.js';
import { createGame } from '../game/engine.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function choose(game) {
  const index = game.getState().targetPlayable.indexOf(true);
  assert.equal(game.dispatch({ type: 'choose-target', index }), true);
}

function pass(game) {
  let steps = 0;
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
    assert.ok(++steps < 100);
  }
  assert.equal(game.getState().phase, 'showdown');
}

function inert(game, action) {
  const state = game.getState();
  const record = game.getRecord();
  assert.equal(game.dispatch(action), false);
  assert.deepEqual(game.getState(), state);
  assert.deepEqual(game.getRecord(), record);
}

function hiddenCpuHand(game) {
  const state = game.getState();
  assert.equal(state.aiHand, null);
  assert.equal(Object.hasOwn(state, 'cpuPlay'), false);
  assert.equal(Object.hasOwn(state, 'aiTargets'), false);
  const attempt = game.getRecord().rounds.at(-1).attempts.at(-1);
  assert.equal(attempt.revealed, false);
  assert.equal(attempt.ai, null);
}

function balanced(game) {
  const state = game.getState();
  const record = game.getRecord();
  assert.equal(
    state.playerAir + state.aiAir + state.pot + state.breathSpent + record.accounts.burned,
    50,
  );
  assert.equal(record.accounts.player, state.playerAir);
  assert.equal(record.accounts.ai, state.aiAir);
  assert.equal(record.accounts.pot, state.pot);
  assert.equal(record.accounting.balanced, true);
  for (const entry of record.ledger) {
    assert.equal(
      Object.values(entry.after).reduce((sum, value) => sum + value, 0),
      50,
    );
    assert.ok(Object.values(entry.after).every((value) => Number.isInteger(value) && value >= 0));
  }
}

function secondRound() {
  const game = createGame({ random: seeded(1) });
  choose(game);
  const firstAttemptId = game.getState().upper.attemptId;
  assert.equal(game.dispatch({ type: 'confirm-hand', attemptId: firstAttemptId }), true);
  pass(game);
  assert.equal(game.dispatch({ type: 'advance-round' }), true);
  choose(game);
  assert.equal(game.getState().playerTarget, 21);
  return { game, firstAttemptId };
}

function ids(hand) {
  return hand.map((next) => next.id).sort();
}

test('a manually submitted hand outside all recommendations is accepted and locks only once', () => {
  const game = createGame({ random: seeded(1) });
  choose(game);
  const before = game.getState();
  const hand = [card(1, 3), card(10, 0), card(10, 1), card(10, 2), card(10, 3)];
  assert.equal(before.playerTarget, 41);
  assert.ok(
    before.candidates.every((candidate) => ids(candidate.hand).join() !== ids(hand).join()),
  );
  hiddenCpuHand(game);
  const action = { type: 'submit-hand', attemptId: before.upper.attemptId, hand };
  assert.equal(game.dispatch(action), true);
  const locked = game.getState();
  assert.equal(locked.phase, 'bet');
  assert.deepEqual(locked.playerHand, hand);
  assert.equal(locked.upper.playerReason, null);
  assert.deepEqual(game.getRecord().rounds.at(-1).attempts.at(-1).player.hand, hand);
  hiddenCpuHand(game);
  balanced(game);
  inert(game, action);
  inert(game, { type: 'upper-timeout', attemptId: before.upper.attemptId });
  pass(game);
  assert.equal(game.getState().lastResult.upperFailed.player, false);
  assert.ok(hand.every((next) => game.getState().discard.some((used) => used.id === next.id)));
  balanced(game);
});

test('reusing a physical card from a prior round fails on submission and settles after betting', () => {
  const { game, firstAttemptId } = secondRound();
  const before = game.getState();
  const hand = [card(1, 0), card(5, 0), card(5, 1), card(5, 2), card(5, 3)];
  assert.ok(before.discard.some((next) => next.id === hand[0].id));
  assert.equal(
    hand.reduce((sum, next) => sum + next.value, 0),
    before.playerTarget,
  );
  inert(game, { type: 'submit-hand', attemptId: firstAttemptId, hand });
  const action = { type: 'submit-hand', attemptId: before.upper.attemptId, hand };
  assert.equal(game.dispatch(action), true);
  const locked = game.getState();
  assert.equal(locked.phase, 'bet');
  assert.equal(locked.upper.playerReason, 'used-card');
  assert.equal(locked.playerHand, null);
  assert.equal(locked.lastResult, null);
  assert.equal(locked.completedRounds, before.completedRounds);
  assert.deepEqual(locked.discard, before.discard);
  assert.deepEqual(game.getRecord().rounds.at(-1).attempts.at(-1).player, {
    valid: false,
    reason: 'used-card',
    hand: null,
  });
  hiddenCpuHand(game);
  balanced(game);
  inert(game, action);
  pass(game);
  const after = game.getState();
  assert.equal(after.lastResult.winner, 'ai');
  assert.deepEqual(after.lastResult.upperFailed, { player: true, ai: false });
  assert.equal(after.lastResult.calamity, false);
  assert.equal(after.lastResult.burned, 0);
  assert.equal(after.completedRounds, before.completedRounds + 1);
  assert.deepEqual(
    ids(after.discard),
    [...new Set([...ids(before.discard), ...ids(after.aiHand)])].sort(),
  );
  assert.ok(hand.slice(1).every((next) => !after.discard.some((used) => used.id === next.id)));
  assert.equal(game.getRecord().rounds.at(-1).attempts.at(-1).player.reason, 'used-card');
  balanced(game);
  inert(game, action);
});

test('an unused card of the same rank and another suit remains legal across rounds', () => {
  const { game } = secondRound();
  const before = game.getState();
  const hand = [card(1, 1), card(5, 0), card(5, 1), card(5, 2), card(5, 3)];
  assert.ok(before.discard.some((next) => next.id === card(1, 0).id));
  assert.ok(hand.every((next) => !before.discard.some((used) => used.id === next.id)));
  assert.equal(
    game.dispatch({ type: 'submit-hand', attemptId: before.upper.attemptId, hand }),
    true,
  );
  assert.deepEqual(game.getState().playerHand, hand);
  assert.equal(game.getState().upper.playerReason, null);
  hiddenCpuHand(game);
  pass(game);
  const after = game.getState();
  assert.equal(after.lastResult.upperFailed.player, false);
  assert.ok(hand.every((next) => after.discard.some((used) => used.id === next.id)));
  assert.ok(after.discard.some((next) => next.id === card(1, 0).id));
  balanced(game);
});

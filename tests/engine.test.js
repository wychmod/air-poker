import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';

function startBet(game, index = 0) {
  assert.equal(game.dispatch({ type: 'choose-target', index }), true);
  assert.equal(game.dispatch({ type: 'confirm-hand' }), true);
}

function rejectUnchanged(game, action) {
  const before = game.getState();
  assert.equal(game.dispatch(action), false);
  assert.deepEqual(game.getState(), before);
}

function assertInvariants(state) {
  for (const value of [state.playerAir, state.aiAir, state.playerBet, state.aiBet, state.pot]) {
    assert.ok(Number.isInteger(value) && value >= 0);
  }
  assert.equal(state.playerBet, state.aiBet);
  assert.equal(state.deck + state.discard.length, 52);
  assert.equal(new Set(state.discard.map((card) => card.id)).size, state.discard.length);
  assert.equal(state.pot, state.phase === 'bet' ? state.playerBet + state.aiBet : 0);
}

test('snapshots cannot mutate game state and matches do not share state', () => {
  const first = createGame();
  const snapshot = first.getState();
  snapshot.targets[0] = 999;
  snapshot.playerAir = -1;
  assert.equal(first.getState().targets[0], 24);
  assert.equal(first.getState().playerAir, 25);
  startBet(first);
  assert.equal(createGame().getState().phase, 'lower');
});

test('wrong phases, indices, repeated locks and repeated settlements are inert', () => {
  const game = createGame();
  for (const action of [
    null,
    { type: 'unknown' },
    { type: 'confirm-hand' },
    { type: 'advance-round' },
    { type: 'select-candidate', index: 0 },
    { type: 'choose-target', index: -1 },
    { type: 'choose-target', index: 5 },
    { type: 'choose-target', index: 0.5 },
  ])
    rejectUnchanged(game, action);
  game.dispatch({ type: 'choose-target', index: 0 });
  rejectUnchanged(game, { type: 'choose-target', index: 1 });
  rejectUnchanged(game, { type: 'select-candidate', index: 99 });
  game.dispatch({ type: 'confirm-hand' });
  rejectUnchanged(game, { type: 'confirm-hand' });
  rejectUnchanged(game, { type: 'select-candidate', index: 1 });
  for (const amount of [NaN, Infinity, -1, 0, 1.5, 5, '2'])
    rejectUnchanged(game, { type: 'bet', action: 'raise', amount });
  rejectUnchanged(game, { type: 'bet', action: 'bogus' });
  game.dispatch({ type: 'bet', action: 'check' });
  rejectUnchanged(game, { type: 'bet', action: 'check' });
  assert.equal(game.getState().traces.length, 1);
});

test('complete matches preserve resources, stop after five rounds or exhaustion, and can reset', () => {
  for (const action of ['check', 'call', 'raise', 'fold', 'all-in']) {
    for (let target = 0; target < 5; target++) {
      const game = createGame();
      let expectedAir = 50;
      let completed = 0;
      while (game.getState().phase !== 'summary') {
        startBet(game, target);
        assertInvariants(game.getState());
        const canRaise = Math.min(game.getState().playerAir, game.getState().aiAir) > 0;
        const legalAction = !canRaise && ['raise', 'all-in'].includes(action) ? 'check' : action;
        assert.equal(game.dispatch({ type: 'bet', action: legalAction, amount: 4 }), true);
        const settled = game.getState();
        completed++;
        expectedAir -= settled.lastResult.burned;
        assert.equal(settled.playerAir + settled.aiAir, expectedAir);
        assert.equal(settled.traces.length, completed);
        assertInvariants(settled);
        game.dispatch({ type: 'advance-round' });
        const next = game.getState();
        if (next.round > settled.round)
          expectedAir -= Math.min(1, settled.playerAir) + Math.min(1, settled.aiAir);
        assert.equal(next.playerAir + next.aiAir, expectedAir);
        assertInvariants(next);
        assert.ok(completed <= 5);
      }
      rejectUnchanged(game, { type: 'advance-round' });
      game.reset();
      assert.deepEqual(game.getState(), createGame().getState());
    }
  }
});

test('discarded cards cannot cause calamity or count toward effective ranks again', () => {
  const game = createGame();
  startBet(game);
  game.dispatch({ type: 'bet', action: 'check' });
  const used = new Set(game.getState().discard.map((card) => card.id));
  game.dispatch({ type: 'advance-round' });
  startBet(game, 1);
  game.dispatch({ type: 'bet', action: 'check' });
  const state = game.getState();
  assert.ok(state.lastResult.overlap.every((card) => !used.has(card.id)));
  assert.ok(state.discard.length >= used.size);
});

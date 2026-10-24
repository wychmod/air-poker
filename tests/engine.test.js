import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function startBet(game, index = game.getState().targetPlayable.indexOf(true)) {
  assert.equal(game.dispatch({ type: 'choose-target', index }), true);
  assert.equal(game.getState().aiHand, null);
  assert.equal(
    game.dispatch({ type: 'confirm-hand', attemptId: game.getState().upper?.attemptId }),
    true,
  );
  if (game.getState().phase === 'bet') assert.equal(game.getState().aiHand, null);
}
function bet(game, action, amount) {
  return game.dispatch({ type: 'bet', action, amount, turnId: game.getState().betting.turnId });
}
function rejectUnchanged(game, action) {
  const before = game.getState();
  assert.equal(game.dispatch(action), false);
  assert.deepEqual(game.getState(), before);
}
function assertInvariants(state) {
  for (const value of [
    state.playerAir,
    state.aiAir,
    state.playerBet,
    state.aiBet,
    state.pot,
    state.breathSpent,
  ])
    assert.ok(Number.isInteger(value) && value >= 0);
  assert.equal(state.deck + state.discard.length, 52);
  assert.equal(new Set(state.discard.map((next) => next.id)).size, state.discard.length);
  assert.equal(state.pot, state.phase === 'bet' ? state.playerBet + state.aiBet : 0);
  assert.equal(state.aiRemaining, 5 - state.usedTargets.length);
  assert.equal(state.aiPlayedTargets.length, state.usedTargets.length);
  assert.equal(state.traces.length, state.completedRounds);
  if (state.phase === 'bet') assert.equal(state.aiHand, null);
  if (state.phase === 'showdown' && !state.lastResult.folded)
    assert.equal(state.playerBet, state.aiBet);
}
function finishBet(game, policy = 'passive', observe = () => {}) {
  let count = 0;
  while (game.getState().phase === 'bet') {
    const state = game.getState();
    observe(state);
    assertInvariants(state);
    if (state.betting.turn === 'ai')
      assert.equal(game.dispatch({ type: 'cpu-bet', turnId: state.betting.turnId }), true);
    else {
      const legal = state.legalBets;
      const action =
        policy === 'fold'
          ? 'fold'
          : policy === 'raise' && legal.canRaise
            ? 'raise'
            : policy === 'all-in' && legal.canAllIn
              ? 'all-in'
              : policy === 'all-in' && legal.canRaise
                ? 'raise'
                : legal.canCall
                  ? 'call'
                  : 'check';
      assert.equal(bet(game, action, policy === 'raise' ? 1 : legal.maxRaise), true);
    }
    assert.ok(++count < 200, 'finite AIR must bound betting');
  }
}

test('snapshots are independent and expose no CPU future cards, proof or locked hand', () => {
  const game = createGame({ random: seeded(7) }),
    before = game.getState(),
    copy = game.getState();
  copy.targets[0] = 999;
  copy.playerAir = -1;
  assert.deepEqual(game.getState(), before);
  assert.equal(before.aiHand, null);
  assert.equal(before.aiTarget, null);
  for (const key of ['aiTargets', 'proof', 'cpuPlay', 'aiUsed', 'candidatesByTarget'])
    assert.equal(Object.hasOwn(before, key), false);
  startBet(game);
  assert.equal(createGame({ random: seeded(8) }).getState().phase, 'lower');
});

test('CPU locked target and physical hand do not change with player target or candidate', () => {
  let expected;
  for (let index = 0; index < 5; index++)
    for (let candidate = 0; candidate < 3; candidate++) {
      const game = createGame({ random: seeded(73) });
      game.dispatch({ type: 'choose-target', index });
      assert.equal(game.getState().aiHand, null);
      assert.equal(game.dispatch({ type: 'select-candidate', index: candidate }), true);
      game.dispatch({ type: 'confirm-hand', attemptId: game.getState().upper?.attemptId });
      finishBet(game);
      const { aiTarget, aiHand } = game.getState();
      expected ??= { aiTarget, aiHand };
      assert.deepEqual({ aiTarget, aiHand }, expected);
    }
});

test('target positions persist and are consumed once, including equal values', () => {
  const game = createGame({ random: () => 0.5 }),
    initial = game.getState().targets;
  assert.equal(initial[0], initial[1]);
  startBet(game, 0);
  finishBet(game, 'fold');
  game.dispatch({ type: 'advance-round' });
  assert.equal(game.getState().phase, 'lower');
  assert.deepEqual(game.getState().targets, initial);
  assert.deepEqual(game.getState().usedTargets, [0]);
  assert.equal(game.getState().targetPlayable[1], true);
  rejectUnchanged(game, { type: 'choose-target', index: 0 });
  startBet(game, 1);
  assert.deepEqual(game.getState().usedTargets, [0, 1]);
});

test('first-round smaller number leads and later rounds alternate regardless of new values', () => {
  const observed = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const game = createGame({ random: seeded(seed) });
    let first;
    while (game.getState().phase !== 'summary' && game.getState().phase !== 'endurance') {
      startBet(game);
      const state = game.getState();
      if (state.round === 1) {
        first = state.firstBettor;
        if (state.playerTarget !== state.aiTarget)
          assert.equal(first, state.playerTarget < state.aiTarget ? 'player' : 'ai');
        observed.add(first);
      }
      assert.equal(
        state.firstBettor,
        state.round % 2 ? first : first === 'player' ? 'ai' : 'player',
      );
      finishBet(game, 'fold');
      game.dispatch({ type: 'advance-round' });
    }
  }
  assert.deepEqual([...observed].sort(), ['ai', 'player']);
});

test('wrong phases, illegal amounts, old action IDs and repeated settlement are inert', () => {
  const game = createGame({ random: seeded(12) });
  for (const action of [
    null,
    { type: 'unknown' },
    { type: 'confirm-hand', attemptId: game.getState().upper?.attemptId },
    { type: 'advance-round' },
    { type: 'cpu-bet', turnId: 1 },
    { type: 'bet-timeout', turnId: 1 },
    { type: 'select-candidate', index: 0 },
    { type: 'choose-target', index: -1 },
    { type: 'choose-target', index: 5 },
    { type: 'choose-target', index: 0.5 },
  ])
    rejectUnchanged(game, action);
  startBet(game);
  rejectUnchanged(game, { type: 'confirm-hand', attemptId: game.getState().upper?.attemptId });
  rejectUnchanged(game, { type: 'select-candidate', index: 1 });
  let state = game.getState();
  if (state.betting.turn === 'ai') {
    rejectUnchanged(game, { type: 'bet', action: 'check', turnId: state.betting.turnId });
    game.dispatch({ type: 'cpu-bet', turnId: state.betting.turnId });
  }
  state = game.getState();
  assert.equal(state.betting.turn, 'player');
  for (const amount of [NaN, Infinity, -1, 0, 1.5, state.legalBets.maxRaise + 1, '1'])
    rejectUnchanged(game, { type: 'bet', action: 'raise', amount, turnId: state.betting.turnId });
  rejectUnchanged(game, { type: 'bet', action: 'bogus', turnId: state.betting.turnId });
  rejectUnchanged(game, { type: 'bet', action: 'fold' });
  const old = state.betting.turnId;
  assert.equal(bet(game, 'fold'), true);
  rejectUnchanged(game, { type: 'bet', action: 'fold', turnId: old });
  rejectUnchanged(game, { type: 'cpu-bet', turnId: old });
  assert.equal(game.getState().completedRounds, 1);
  game.reset();
  startBet(game);
  assert.ok(game.getState().betting.turnId > old);
  rejectUnchanged(game, { type: 'bet-timeout', turnId: old });
});

test('timeouts check with no pressure, fold under pressure, and cannot fire twice', () => {
  let checked = false,
    folded = false;
  for (let seed = 1; seed <= 20 && (!checked || !folded); seed++) {
    const game = createGame({ random: seeded(seed) });
    startBet(game);
    let steps = 0;
    while (game.getState().phase === 'bet') {
      const state = game.getState(),
        turnId = state.betting.turnId;
      if (state.betting.turn === 'ai') game.dispatch({ type: 'cpu-bet', turnId });
      else {
        const pressure = state.legalBets.toCall > 0;
        assert.equal(game.dispatch({ type: 'bet-timeout', turnId }), true);
        rejectUnchanged(game, { type: 'bet-timeout', turnId });
        if (pressure) {
          folded = true;
          assert.equal(game.getState().lastResult.foldedBy, 'player');
          assert.equal(game.getState().lastResult.burned, 0);
        } else {
          checked = true;
          assert.equal(game.getState().betting.history.at(-1).action, 'check');
        }
      }
      assert.ok(++steps < 50);
    }
  }
  assert.ok(checked);
  assert.ok(folded);
});

test('complete multi-turn matches conserve AIR, support both folds and preserve full legal hands', () => {
  const endings = new Set(),
    folders = new Set();
  let overlaps = 0,
    turns = 0;
  for (const policy of ['passive', 'raise', 'all-in', 'fold'])
    for (let seed = 1; seed <= 12; seed++) {
      const game = createGame({ random: seeded(seed) }),
        initial = game.getState().targets;
      let burned = 0;
      while (game.getState().phase !== 'summary' && game.getState().phase !== 'endurance') {
        const before = game.getState();
        assert.deepEqual(before.targets, initial);
        const legal = before.targetPlayable.flatMap((ok, index) => (ok ? [index] : []));
        for (let index = 0; index < 5; index++)
          if (!before.targetPlayable[index])
            rejectUnchanged(game, { type: 'choose-target', index });
        startBet(game, legal[(seed - 1) % legal.length]);
        finishBet(game, policy, (state) => {
          turns++;
          assert.equal(state.playerAir + state.aiAir + state.pot + state.breathSpent + burned, 50);
        });
        const settled = game.getState();
        burned += settled.lastResult.burned;
        overlaps += settled.lastResult.overlap.length;
        for (const [hand, target] of [
          [settled.playerHand, settled.playerTarget],
          [settled.aiHand, settled.aiTarget],
        ]) {
          assert.equal(hand.length, 5);
          assert.equal(new Set(hand.map((next) => next.id)).size, 5);
          assert.equal(
            hand.reduce((sum, next) => sum + next.value, 0),
            target,
          );
          assert.ok(hand.every((next) => !before.discard.some((used) => used.id === next.id)));
        }
        if (settled.lastResult.folded) {
          folders.add(settled.lastResult.foldedBy);
          assert.equal(
            settled.lastResult.winner,
            settled.lastResult.foldedBy === 'player' ? 'ai' : 'player',
          );
          assert.equal(settled.lastResult.calamity, false);
          assert.equal(settled.lastResult.burned, 0);
        }
        assert.equal(settled.playerAir + settled.aiAir + settled.breathSpent + burned, 50);
        assertInvariants(settled);
        game.dispatch({ type: 'advance-round' });
        const next = game.getState();
        assert.equal(next.playerAir + next.aiAir + next.breathSpent + burned, 50);
        assertInvariants(next);
        assert.ok(next.completedRounds <= 5);
      }
      const final = game.getState();
      endings.add(final.enduranceReason);
      assert.equal(game.dispatch({ type: 'fast-forward', sessionId: final.sessionId }), true);
      assert.equal(game.getState().phase, 'summary');
      assert.equal(final.completedRounds, final.traces.length);
      rejectUnchanged(game, { type: 'advance-round' });
      game.reset();
      assert.equal(game.getState().phase, 'lower');
      assert.equal(game.getState().playerAir, 24);
      assert.deepEqual(game.getState().discard, []);
      assert.deepEqual(game.getState().usedTargets, []);
      assert.equal(game.getState().aiHand, null);
    }
  assert.ok(turns > 200);
  assert.ok(overlaps > 0);
  assert.deepEqual([...folders].sort(), ['ai', 'player']);
  assert.ok(endings.has('no-betting-air'));
  assert.ok(endings.has('round-limit'));
});

test('equal first-round numbers use the declared random tie-break', () => {
  for (const [roll, expected] of [
    [0, 'player'],
    [0.99, 'ai'],
  ]) {
    const source = seeded(24);
    let tieRoll = null;
    const game = createGame({ random: () => tieRoll ?? source() });
    tieRoll = roll;
    game.dispatch({ type: 'choose-target', index: 2 });
    const state = game.getState();
    assert.equal(state.playerTarget, 35);
    assert.equal(state.aiTarget, 35);
    assert.equal(state.firstBettor, expected);
  }
});

test('CPU betting history cannot depend on which hidden player candidate was selected', () => {
  let expected;
  for (let candidate = 0; candidate < 3; candidate++) {
    const game = createGame({ random: seeded(73) });
    game.dispatch({ type: 'choose-target', index: 0 });
    game.dispatch({ type: 'select-candidate', index: candidate });
    game.dispatch({ type: 'confirm-hand', attemptId: game.getState().upper?.attemptId });
    finishBet(game);
    const history = game.getState().betting.history;
    expected ??= history;
    assert.deepEqual(history, expected);
  }
});

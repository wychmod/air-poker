import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { makeCandidates } from '../game/cards.js';
import { getBetOptions } from '../game/betting.js';

// Rule fixtures specify the intended tie independently of opponent policy.
const tieOpponent = {
  choosePlay: (targets, used, discard) => ({
    index: targets.indexOf(35),
    target: 35,
    ...makeCandidates(35, discard)[0],
  }),
  chooseBet: ({ options }) => ({ action: options.canCall ? 'call' : 'check' }),
};

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
  assert.equal(state.accounting.player, state.playerAir);
  assert.equal(state.accounting.ai, state.aiAir);
  assert.equal(state.accounting.pot, state.pot);
  assert.equal(state.accounting.breathing, state.breathSpent);
  assert.equal(state.accounting.balanced, true);
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

test('snapshots are independent and expose no opponent future cards, proof or locked hand', () => {
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

test('quick picks offer different hand types while retaining the strongest first choice', () => {
  const game = createGame({ random: () => 0.41 });
  assert.equal(game.dispatch({ type: 'choose-target', index: 0 }), true);
  const state = game.getState();
  assert.equal(state.candidates.length, 3);
  assert.equal(new Set(state.candidates.map((candidate) => candidate.rank.key)).size, 3);
  assert.deepEqual(state.candidates[0], makeCandidates(state.playerTarget, state.discard, 1)[0]);
});

test('opponent locked target and physical hand do not change with player target or candidate', () => {
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

test('target positions persist and are consumed once, and the player side never repeats a value', () => {
  const game = createGame({ random: () => 0.5 }),
    initial = game.getState().targets;
  // The deal constrains only the player half, so its five numbers stay distinct.
  assert.equal(new Set(initial).size, 5);
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
        for (const [hand, target, side] of [
          [settled.playerHand, settled.playerTarget, 'player'],
          [settled.aiHand, settled.aiTarget, 'ai'],
        ]) {
          // A side with no legal hand locks a documented failure instead of cards.
          if (hand === null) {
            assert.ok(
              side === 'ai' || settled.upper?.playerReason !== null,
              'a missing player hand must carry a failure reason',
            );
            continue;
          }
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

test('an overlapping tie refunds stakes without calamity and records the current discard', () => {
  const game = createGame({ random: seeded(24), opponent: tieOpponent });
  assert.equal(game.dispatch({ type: 'choose-target', index: 2 }), true);
  assert.equal(
    game.dispatch({ type: 'confirm-hand', attemptId: game.getState().upper.attemptId }),
    true,
  );
  finishBet(game, 'passive');
  const state = game.getState();
  assert.equal(state.phase, 'showdown');
  assert.equal(state.lastResult.winner, 'tie');
  assert.equal(state.lastResult.overlap.length, 5);
  assert.equal(state.lastResult.calamity, false);
  assert.equal(state.lastResult.burned, 0);
  assert.deepEqual(
    new Set(state.lastResult.usedCardIds),
    new Set(state.discard.map((card) => card.id)),
  );
  assert.equal(state.discard.length, 5);
  assert.equal(state.deck, 47);
  assert.equal(state.accounting.balanced, true);
});

test('equal first-round numbers use the declared random tie-break', () => {
  for (const [roll, expected] of [
    [0, 'player'],
    [0.99, 'ai'],
  ]) {
    const source = seeded(24);
    let tieRoll = null;
    const game = createGame({ random: () => tieRoll ?? source(), opponent: tieOpponent });
    tieRoll = roll;
    game.dispatch({ type: 'choose-target', index: 2 });
    const state = game.getState();
    assert.equal(state.playerTarget, 35);
    assert.equal(state.aiTarget, 35);
    assert.equal(state.firstBettor, expected);
  }
});

test('opponent betting history cannot depend on which hidden player candidate was selected', () => {
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

test('accepted public bets reach the opponent as isolated observations and reset clears them', () => {
  const received = [];
  const opponent = {
    choosePlay: (targets, used, discard) => {
      const index = targets.findIndex((_, slot) => !used.includes(slot));
      return { index, target: targets[index], ...makeCandidates(targets[index], discard)[0] };
    },
    chooseBet: ({ options, observations }) => {
      received.push(structuredClone(observations));
      return { action: options.canCheck ? 'check' : options.canCall ? 'call' : 'fold' };
    },
  };
  const game = createGame({ random: seeded(97), opponent });
  function startWithTurn(actor, resetBetweenAttempts = false) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const index = game.getState().targetPlayable.indexOf(true);
      game.dispatch({ type: 'choose-target', index });
      game.dispatch({ type: 'confirm-hand', attemptId: game.getState().upper.attemptId });
      if (game.getState().phase === 'bet' && game.getState().betting.turn === actor) return;
      if (resetBetweenAttempts) game.reset();
      else assert.fail('No deterministic betting fixture found for ' + actor);
    }
    assert.fail('No deterministic betting fixture found for ' + actor);
  }

  startWithTurn('player');
  const state = game.getState();
  assert.equal(state.legalBets.canCheck, true);
  assert.equal(
    game.dispatch({ type: 'bet', action: 'check', turnId: state.betting.turnId - 1 }),
    false,
  );
  assert.equal(game.getState().betting.history.length, 0);
  assert.equal(game.dispatch({ type: 'bet', action: 'check', turnId: state.betting.turnId }), true);
  const aiTurn = game.getState();
  assert.equal(game.dispatch({ type: 'cpu-bet', turnId: aiTurn.betting.turnId }), true);
  assert.equal(received[0].at(-1).action, 'check');
  assert.equal(received[0].at(-1).turnId, state.betting.turnId);
  received[0].at(-1).action = 'fold';

  game.reset();
  startWithTurn('ai', true);
  const fresh = game.getState();
  assert.equal(game.dispatch({ type: 'cpu-bet', turnId: fresh.betting.turnId }), true);
  assert.deepEqual(received.at(-1), [], 'reset clears observations from the previous session');
  assert.notEqual(fresh.sessionId, state.sessionId);
});

test('calling ends betting at once, so neither side is ever offered a reply', () => {
  // The opponent always raises the first chance it gets, then calls. Under the
  // old rule this loop ran many turns; now the player's call reveals at once.
  const aggressive = {
    choosePlay: (targets, used, discard) => {
      const index = targets.findIndex((_, slot) => !used.includes(slot));
      return { index, target: targets[index], ...makeCandidates(targets[index], discard)[0] };
    },
    chooseBet: ({ options }) =>
      options.canRaise ? { action: 'raise', amount: 1 } : { action: 'call' },
  };
  for (const seed of [3, 11, 29, 42, 77]) {
    const game = createGame({ random: seeded(seed), opponent: aggressive });
    startBet(game);
    if (game.getState().phase !== 'bet') continue;
    // Let the opponent raise if it moves first; the player answers by calling.
    for (let guard = 0; guard < 8 && game.getState().phase === 'bet'; guard++) {
      const state = game.getState();
      if (state.betting.turn === 'ai') {
        game.dispatch({ type: 'cpu-bet', turnId: state.betting.turnId });
        continue;
      }
      if (!state.legalBets.canCall) {
        game.dispatch({ type: 'bet', action: 'check', turnId: state.betting.turnId });
        continue;
      }
      const called = game.getState();
      assert.equal(
        game.dispatch({ type: 'bet', action: 'call', turnId: called.betting.turnId }),
        true,
      );
      const after = game.getState();
      assert.equal(after.phase, 'showdown', 'a call reveals immediately (seed ' + seed + ')');
      assert.equal(after.betting.turn, null);
      assert.equal(after.playerBet, after.aiBet, 'a caller has matched the stakes');
      assert.equal(after.pot, 0);
      assert.equal(after.accounting.balanced, true);
      assert.equal(after.accounting.accountedTotal, 50);
      assert.deepEqual(
        after.betting.history.map((event) => event.actor).at(-2),
        'ai',
        'the last action before the reveal was the opponent raise being called',
      );
      break;
    }
  }
});

test('an opponent call also ends betting, so the player never gets to raise again', () => {
  // The opponent always calls the player's raise. Under the old rule the player
  // was then handed another raise option; the call must settle the round.
  const caller = {
    choosePlay: (targets, used, discard) => {
      const index = targets.findIndex((_, slot) => !used.includes(slot));
      return { index, target: targets[index], ...makeCandidates(targets[index], discard)[0] };
    },
    chooseBet: ({ options }) => (options.canCall ? { action: 'call' } : { action: 'check' }),
  };
  for (const seed of [5, 13, 21, 38]) {
    const game = createGame({ random: seeded(seed), opponent: caller });
    startBet(game);
    let state = game.getState();
    if (state.phase !== 'bet' || state.betting.turn !== 'player') continue;
    assert.equal(
      game.dispatch({
        type: 'bet',
        action: state.legalBets.canRaise ? 'raise' : 'check',
        amount: state.legalBets.canRaise ? 1 : undefined,
        turnId: state.betting.turnId,
      }),
      true,
    );
    state = game.getState();
    if (state.phase !== 'bet' || state.betting.turn !== 'ai') continue;
    // The opponent answers with a call, which must reveal immediately.
    assert.equal(game.dispatch({ type: 'cpu-bet', turnId: state.betting.turnId }), true);
    const after = game.getState();
    assert.equal(after.phase, 'showdown', 'an opponent call reveals at once (seed ' + seed + ')');
    assert.equal(after.betting.turn, null);
    assert.equal(after.playerBet, after.aiBet);
    assert.equal(after.accounting.balanced, true);
    assert.equal(after.accounting.accountedTotal, 50);
    assert.equal(after.betting.history.at(-1).action, 'call');
    return;
  }
  assert.fail('No deterministic fixture found for an opponent call');
});

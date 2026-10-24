import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBetAction, getBetOptions } from '../game/betting.js';

const table = (changes = {}) => ({
  phase: 'bet',
  playerAir: 24,
  aiAir: 24,
  playerBet: 1,
  aiBet: 1,
  pot: 2,
  betting: { first: 'player', turn: 'player', turnId: 1, checks: 0, history: [] },
  ...changes,
});
function move(state, actor, action, amount) {
  const before = structuredClone(state);
  const result = applyBetAction(state, actor, action, amount);
  assert.deepEqual(state, before, 'transition must not mutate input');
  assert.ok(result);
  const next = result.state;
  assert.equal(next.pot, next.playerBet + next.aiBet);
  assert.equal(next.playerAir + next.aiAir + next.pot, state.playerAir + state.aiAir + state.pot);
  assert.ok(
    [next.playerAir, next.aiAir, next.playerBet, next.aiBet].every(
      (value) => Number.isInteger(value) && value >= 0,
    ),
  );
  return result;
}

test('source sequence: raise 1, call+raise 2, call+raise 4 gives stakes of 8 each', () => {
  let state = table();
  for (const [actor, amount, expectedCall] of [
    ['player', 1, 0],
    ['ai', 2, 1],
    ['player', 4, 2],
  ]) {
    const options = getBetOptions(state, actor);
    assert.equal(options.toCall, expectedCall);
    assert.equal(options.maxRaise, amount);
    assert.equal(applyBetAction(state, actor, 'raise', amount + 1), null);
    state = move(state, actor, 'raise', amount).state;
  }
  const call = move(state, 'ai', 'call');
  assert.equal(call.outcome, 'continue', 'calling does not silently count as both checks');
  assert.equal(call.state.playerBet, 8);
  assert.equal(call.state.aiBet, 8);
  const firstCheck = move(call.state, 'player', 'check');
  assert.equal(firstCheck.outcome, 'continue');
  assert.equal(move(firstCheck.state, 'ai', 'check').outcome, 'showdown');
});

test('only unpressured checks are legal; calls and raises reset the check sequence', () => {
  const first = move(table(), 'player', 'check');
  assert.equal(first.outcome, 'continue');
  assert.equal(first.state.betting.turn, 'ai');
  assert.equal(getBetOptions(first.state, 'player').active, false);
  assert.equal(applyBetAction(first.state, 'player', 'check'), null);
  assert.equal(applyBetAction(first.state, 'ai', 'call'), null);
  const raised = move(first.state, 'ai', 'raise', 1);
  assert.equal(raised.state.betting.checks, 0);
  assert.equal(getBetOptions(raised.state, 'player').toCall, 1);
  assert.equal(applyBetAction(raised.state, 'player', 'check'), null);
  const called = move(raised.state, 'player', 'call');
  assert.equal(called.state.betting.checks, 0);
  assert.equal(called.state.playerAir, 23);
  assert.equal(
    move(move(called.state, 'ai', 'check').state, 'player', 'check').outcome,
    'showdown',
  );
});

test('raise bounds apply to the increment and do not impose a Texas minimum raise', () => {
  let state = move(table(), 'player', 'raise', 1).state;
  state = move(state, 'ai', 'raise', 2).state;
  assert.equal(move(state, 'player', 'raise', 1).event.paid, 3);
  for (const amount of [0, -1, 1.5, NaN, Infinity, '1', 999])
    assert.equal(applyBetAction(state, 'player', 'raise', amount), null);
  assert.equal(applyBetAction(table(), 'player', 'dance'), null);
  assert.equal(applyBetAction({ ...table(), phase: 'showdown' }, 'player', 'check'), null);
});

test('matched all-in respects half-pot and the poorer side, then waits for a response', () => {
  assert.equal(getBetOptions(table(), 'player').canAllIn, false);
  assert.equal(applyBetAction(table(), 'player', 'all-in'), null);
  const small = table({ playerAir: 1, aiAir: 10 });
  const options = getBetOptions(small, 'player');
  assert.equal(options.allInCost, 1);
  assert.equal(options.canAllIn, true);
  const pushed = move(small, 'player', 'all-in');
  assert.equal(pushed.outcome, 'continue');
  assert.equal(pushed.state.aiBet, 1, 'opponent is not automatically charged');
  assert.equal(getBetOptions(pushed.state, 'ai').maxRaise, 0);
  assert.equal(getBetOptions(pushed.state, 'ai').allInCost, 1);
  const called = move(pushed.state, 'ai', 'call');
  assert.equal(called.outcome, 'showdown');
  assert.equal(called.state.playerBet, 2);
  assert.equal(called.state.aiBet, 2);
  assert.equal(called.state.aiAir, 9);
});

test('either player may fold unequal stakes, preserving the actual pot for settlement', () => {
  const raised = move(table(), 'player', 'raise', 1).state;
  const folded = move(raised, 'ai', 'fold');
  assert.equal(folded.outcome, 'fold');
  assert.equal(folded.foldedBy, 'ai');
  assert.equal(folded.state.pot, 3);
  assert.equal(folded.state.betting.turn, null);
  assert.equal(move(table(), 'player', 'fold').foldedBy, 'player');
});

test('repeated maximum raises terminate by resource limits without negative AIR', () => {
  let state = table();
  let actions = 0;
  while (state.betting.turn) {
    const actor = state.betting.turn;
    const options = getBetOptions(state, actor);
    const result = move(
      state,
      actor,
      options.canRaise ? 'raise' : options.canCall ? 'call' : 'check',
      options.maxRaise,
    );
    state = result.state;
    actions++;
    assert.ok(actions < 50);
  }
  assert.equal(state.playerBet, 25);
  assert.equal(state.aiBet, 25);
  assert.equal(state.playerAir, 0);
  assert.equal(state.aiAir, 0);
});

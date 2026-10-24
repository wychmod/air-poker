import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceBreathing,
  startBreathing,
  timeToDrowning,
  CANISTER_MS,
  HYPOXIA_MS,
} from '../game/breathing.js';

test('opened canisters are removed from betting balances and replaced at the 300-second boundary', () => {
  const start = startBreathing(25, 25);
  assert.equal(start.playerAir, 24);
  assert.equal(start.aiAir, 24);
  assert.equal(start.breathSpent, 2);
  assert.equal(start.respiration.player.remainingMs, CANISTER_MS);
  const before = structuredClone(start);
  const last = advanceBreathing(start, CANISTER_MS - 1);
  assert.equal(last.playerAir, 24);
  assert.equal(last.respiration.player.remainingMs, 1);
  const next = advanceBreathing(last, 1);
  assert.equal(next.playerAir, 23);
  assert.equal(next.breathSpent, 4);
  assert.equal(next.respiration.player.remainingMs, CANISTER_MS);
  assert.deepEqual(start, before);
});

test('zero unopened AIR is alive until active supply and hypoxia grace actually end', () => {
  const start = startBreathing(1, 2);
  assert.equal(start.playerAir, 0);
  const noSupply = advanceBreathing(start, CANISTER_MS);
  assert.deepEqual(noSupply.drowned, []);
  assert.equal(noSupply.respiration.player.remainingMs, 0);
  const grace = advanceBreathing(noSupply, HYPOXIA_MS - 1);
  assert.deepEqual(grace.drowned, []);
  const final = advanceBreathing(grace, 500000);
  assert.deepEqual(final.drowned, ['player']);
  assert.equal(final.respiration.elapsedMs, CANISTER_MS + HYPOXIA_MS);
  assert.equal(final.respiration.ai.remainingMs, CANISTER_MS - HYPOXIA_MS);
});

test('long jumps stop at first drowning; identical supplies expire simultaneously', () => {
  const final = advanceBreathing(startBreathing(25, 25), 900000000);
  assert.deepEqual(final.drowned, ['player', 'ai']);
  assert.equal(final.respiration.elapsedMs, 25 * CANISTER_MS + HYPOXIA_MS);
  assert.equal(final.breathSpent, 50);
  assert.equal(final.playerAir + final.aiAir, 0);
});

test('partitioned elapsed time equals one jump and opened AIR remains conserved', () => {
  let partitioned = startBreathing(8, 11);
  const duration = CANISTER_MS * 7 + 4444;
  for (const delta of [1, 33333, 299999, duration - 333333])
    partitioned = advanceBreathing(partitioned, delta);
  assert.deepEqual(partitioned, advanceBreathing(startBreathing(8, 11), duration));
  assert.equal(partitioned.playerAir + partitioned.aiAir + partitioned.breathSpent, 19);
  for (const delta of [-1, 0.5, NaN, Infinity])
    assert.throws(() => advanceBreathing(partitioned, delta), RangeError);
});

test('winnings received during grace restore supply and a later full grace', () => {
  const noAir = advanceBreathing(startBreathing(1, 2), CANISTER_MS + 5000);
  noAir.playerAir = 1;
  assert.equal(timeToDrowning(noAir.playerAir, noAir.respiration.player), CANISTER_MS + HYPOXIA_MS);
  const resumed = advanceBreathing(noAir, 0);
  assert.equal(resumed.respiration.player.shortageMs, 0);
  assert.equal(resumed.playerAir, 0);
  assert.equal(resumed.respiration.player.remainingMs, CANISTER_MS);
});

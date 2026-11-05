import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_IDS,
  difficultyPolicy,
  isDifficultyId,
  normalizeDifficulty,
} from '../game/difficulty.js';

test('difficulty ids are explicit and new preferences safely migrate to medium', () => {
  assert.deepEqual(DIFFICULTY_IDS, ['beginner', 'medium', 'hard']);
  assert.equal(DEFAULT_DIFFICULTY, 'medium');
  for (const id of DIFFICULTY_IDS) {
    assert.equal(isDifficultyId(id), true);
    assert.equal(normalizeDifficulty(id), id);
  }
  for (const id of ['analyst', 'abyss', 'mirror', 'Hard', '', null, undefined, {}]) {
    assert.equal(isDifficultyId(id), false);
    assert.equal(normalizeDifficulty(id), 'medium');
    assert.equal(difficultyPolicy(id), difficultyPolicy('medium'));
  }
});

test('policies are immutable and use bounded planning with increasing action choice', () => {
  assert.equal(Object.isFrozen(DIFFICULTY_IDS), true);
  for (const id of DIFFICULTY_IDS) {
    const policy = difficultyPolicy(id);
    assert.equal(Object.isFrozen(policy), true);
    assert.equal(policy.id, id);
    assert.ok(policy.maxCandidateCalls <= 256);
    assert.throws(() => {
      policy.riskWeight = 0;
    }, TypeError);
  }
  assert.equal(difficultyPolicy('beginner').planningDepth, 0);
  assert.equal(difficultyPolicy('medium').planningDepth, 1);
  assert.equal(difficultyPolicy('hard').planningDepth, 2);
  assert.equal(difficultyPolicy('hard').riskWeight, 0.16);
  assert.equal(difficultyPolicy('hard').adaptive, true);
});

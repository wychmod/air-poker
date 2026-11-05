import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { contractForDifficulty, matchModeSummary, modeSummary } from '../ui/modes.js';

test('match mode is copied into the record and becomes immutable', () => {
  const mode = { opponent: 'abyss', contract: 'no-fold' };
  const game = createGame({ mode, random: () => 0.41 });
  assert.deepEqual(game.getRecord().mode, mode);
  mode.opponent = 'mirror';
  mode.contract = 'perfect';
  assert.deepEqual(game.getRecord().mode, { opponent: 'abyss', contract: 'no-fold' });
});

test('records without a mode stay valid and keep the legacy shape', () => {
  const game = createGame({ random: () => 0.41 });
  const record = game.getRecord();
  assert.equal(record.mode, null);
  assert.equal(typeof record.matchId, 'string');
  assert.equal(Array.isArray(record.rounds), true);
});

test('mode summaries distinguish new difficulty ids from legacy and missing metadata', () => {
  for (const lang of ['zh', 'en']) {
    const difficulty = modeSummary({ mode: { opponent: 'hard', contract: 'no-fold' } }, lang);
    assert.equal(difficulty.kind, 'difficulty');
    assert.equal(difficulty.opponent.id, 'hard');
    assert.equal(difficulty.contract.id, 'no-fold');
    for (const id of ['analyst', 'abyss', 'mirror', null, 'invalid']) {
      const legacy = modeSummary({ mode: { opponent: id } }, lang);
      assert.equal(legacy.kind, 'persona');
      assert.equal(
        legacy.opponent.id,
        ['analyst', 'abyss', 'mirror'].includes(id) ? id : 'analyst',
      );
    }
  }
});

test('each new difficulty carries one fixed built-in goal', () => {
  assert.deepEqual(
    Object.fromEntries(
      ['beginner', 'medium', 'hard'].map((difficulty) => [
        difficulty,
        contractForDifficulty(difficulty),
      ]),
    ),
    { beginner: 'none', medium: 'comeback', hard: 'perfect' },
  );

  for (const [difficulty, contract] of Object.entries({
    beginner: 'none',
    medium: 'comeback',
    hard: 'perfect',
  })) {
    const mode = matchModeSummary({ setup: { difficulty }, lang: 'en' });
    assert.equal(mode.kind, 'difficulty');
    assert.equal(mode.contract.id, contract);
  }
});

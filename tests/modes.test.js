import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';

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

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTRACT_IDS,
  DEFAULT_CONTRACT,
  evaluateContract,
  isContractId,
} from '../game/contracts.js';

const settledRound = (winner, extra = {}) => ({
  number: 1,
  status: 'settled',
  settlement: { winner },
  actions: [],
  airBefore: { player: 25, ai: 25 },
  totals: { player: { net: 0 }, ai: { net: 0 } },
  ...extra,
});

const completed = (overrides = {}) => ({
  status: 'completed',
  mode: { opponent: 'analyst', contract: 'none' },
  result: { winner: 'player' },
  rounds: [],
  ...overrides,
});

test('contract ids are explicit and unknown ids fall back to no contract', () => {
  assert.deepEqual(CONTRACT_IDS, ['none', 'no-fold', 'comeback', 'perfect']);
  assert.equal(DEFAULT_CONTRACT, 'none');
  assert.equal(isContractId('perfect'), true);
  assert.equal(isContractId('PERFECT'), false);
  assert.equal(isContractId(null), false);
  assert.equal(evaluateContract(completed(), 'not-a-contract'), null);
});

test('no contract and unfinished records never claim a result', () => {
  assert.equal(evaluateContract(completed()), null);
  assert.equal(
    evaluateContract(completed({ mode: { contract: 'no-fold' }, status: 'live' })),
    null,
  );
  assert.equal(evaluateContract(completed({ mode: { contract: 'no-fold' }, result: null })), null);
});

test('never-fold completes only after a win with zero player folds', () => {
  const clean = completed({
    mode: { contract: 'no-fold' },
    rounds: [settledRound('player', { actions: [{ actor: 'ai', action: 'fold' }] })],
  });
  assert.deepEqual(evaluateContract(clean), {
    id: 'no-fold',
    complete: true,
    stats: { folds: 0 },
  });
  const folded = completed({
    mode: { contract: 'no-fold' },
    rounds: [
      settledRound('ai', {
        actions: [
          { actor: 'player', action: 'fold' },
          { actor: 'player', action: 'fold' },
        ],
      }),
    ],
  });
  assert.deepEqual(evaluateContract(folded), {
    id: 'no-fold',
    complete: false,
    stats: { folds: 2 },
  });
});

test('comeback measures a real end-of-round deficit from recorded air', () => {
  const behind = settledRound('ai', {
    totals: { player: { net: -4 }, ai: { net: 4 } },
  });
  const record = completed({ mode: { contract: 'comeback' }, rounds: [behind] });
  assert.deepEqual(evaluateContract(record), {
    id: 'comeback',
    complete: true,
    stats: { largestDeficit: 8 },
  });
  const ahead = completed({ mode: { contract: 'comeback' }, rounds: [settledRound('player')] });
  assert.deepEqual(evaluateContract(ahead), {
    id: 'comeback',
    complete: false,
    stats: { largestDeficit: 0 },
  });
  const lost = completed({
    mode: { contract: 'comeback' },
    result: { winner: 'ai' },
    rounds: [behind],
  });
  assert.equal(evaluateContract(lost).complete, false);
});

test('clean sweep requires a win in every settled round and at least one round', () => {
  const record = completed({
    mode: { contract: 'perfect' },
    rounds: [settledRound('player'), settledRound('player', { number: 2 })],
  });
  assert.deepEqual(evaluateContract(record), {
    id: 'perfect',
    complete: true,
    stats: { roundsWon: 2, settledRounds: 2 },
  });
  const mixed = completed({
    mode: { contract: 'perfect' },
    rounds: [settledRound('player'), settledRound('ai', { number: 2 })],
  });
  assert.deepEqual(evaluateContract(mixed), {
    id: 'perfect',
    complete: false,
    stats: { roundsWon: 1, settledRounds: 2 },
  });
  assert.equal(evaluateContract(completed({ mode: { contract: 'perfect' } })).complete, false);
});

test('an explicit requested contract overrides the stored one for evaluation', () => {
  const record = completed({
    mode: { contract: 'none' },
    rounds: [settledRound('player')],
  });
  assert.equal(evaluateContract(record, 'perfect').complete, true);
  assert.equal(evaluateContract(record), null);
});

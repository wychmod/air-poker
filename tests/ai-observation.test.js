import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendBetObservation,
  makeBetObservation,
  MAX_BET_OBSERVATIONS,
  summarizePublicActions,
} from '../game/ai-observation.js';

const before = { sessionId: 3, round: 2, attemptId: 9 };
const options = { toCall: 2, maxRaise: 4, canCall: true, canAllIn: false };
const event = {
  turnId: 18,
  actor: 'player',
  action: 'raise',
  paid: 4,
  raised: 2,
  called: 2,
};

test('bet observations retain a whitelist of accepted public facts only', () => {
  const input = { ...before, playerHand: ['private'], proof: 'secret' };
  const observation = makeBetObservation(input, options, event, false);
  assert.deepEqual(observation, {
    sessionId: 3,
    round: 2,
    attemptId: 9,
    turnId: 18,
    actor: 'player',
    action: 'raise',
    paid: 4,
    raised: 2,
    toCallBefore: 2,
    maxRaiseBefore: 4,
    canContinueBefore: true,
    timedOut: false,
  });
  assert.equal(Object.hasOwn(observation, 'playerHand'), false);
  assert.equal(Object.hasOwn(observation, 'called'), false);
});

test('public behavior uses opportunity-specific denominators and excludes timeouts', () => {
  const rows = [
    { ...makeBetObservation(before, options, event), actor: 'player' },
    {
      ...makeBetObservation({ ...before, round: 3 }, options, {
        ...event,
        turnId: 19,
        action: 'fold',
      }),
      actor: 'player',
    },
    {
      ...makeBetObservation(
        { ...before, round: 4 },
        { toCall: 2, maxRaise: 0, canCall: true, canAllIn: false },
        {
          ...event,
          turnId: 20,
          action: 'call',
          raised: 0,
        },
      ),
      actor: 'player',
    },
    {
      ...makeBetObservation(
        { ...before, round: 5 },
        { toCall: 0, maxRaise: 3, canCall: false, canAllIn: false },
        {
          ...event,
          turnId: 21,
          action: 'check',
          paid: 0,
          raised: 0,
        },
      ),
      actor: 'player',
    },
    {
      ...makeBetObservation({ ...before, round: 6 }, options, {
        ...event,
        turnId: 22,
        actor: 'ai',
      }),
    },
    {
      ...makeBetObservation(
        { ...before, round: 7 },
        { toCall: 0, maxRaise: 3, canCall: false, canAllIn: false },
        {
          ...event,
          turnId: 23,
          action: 'check',
          paid: 0,
          raised: 0,
        },
        true,
      ),
      actor: 'player',
    },
  ];
  const summary = summarizePublicActions(rows);
  assert.equal(summary.samples, 4);
  assert.deepEqual(summary.aggression, {
    count: 1,
    opportunities: 3,
    prior: 0.3,
    rate: (1 + 6 * 0.3) / 9,
    confidence: 3 / 12,
  });
  assert.equal(summary.continue.count, 2);
  assert.equal(summary.continue.opportunities, 3);
  assert.equal(summary.fold.count, 1);
  assert.equal(summary.fold.opportunities, 3);
  assert.equal(summary.check.count, 1);
  assert.equal(summary.check.opportunities, 1);
});

test('forced folds are retained but excluded from voluntary continue and fold rates', () => {
  const forcedFold = makeBetObservation(
    before,
    { toCall: 4, maxRaise: 0, canCall: false, canAllIn: false },
    { ...event, action: 'fold', paid: 0, raised: 0 },
  );
  const summary = summarizePublicActions([forcedFold]);
  assert.equal(summary.samples, 1);
  assert.equal(summary.fold.count, 0);
  assert.equal(summary.fold.opportunities, 0);
  assert.equal(summary.continue.count, 0);
  assert.equal(summary.continue.opportunities, 0);
  assert.equal(summary.check.opportunities, 0);
});

test('observation summaries ignore duplicate turn ids, malformed facts, and mutate nothing', () => {
  const first = makeBetObservation(before, options, event);
  const duplicate = { ...first, action: 'fold' };
  const invalid = { ...first, turnId: -1 };
  const input = [first, duplicate, invalid];
  const snapshot = structuredClone(input);
  const summary = summarizePublicActions(input);
  assert.equal(summary.samples, 1);
  assert.equal(summary.aggression.count, 1);
  assert.deepEqual(input, snapshot);
  const empty = summarizePublicActions([]);
  assert.equal(empty.samples, 0);
  assert.equal(empty.aggression.confidence, 0);
  assert.equal(empty.aggression.rate, empty.aggression.prior);
});

test('observation history de-duplicates accepted turns and retains only the newest 64', () => {
  const observations = Array.from({ length: MAX_BET_OBSERVATIONS }, (_, turnId) => ({
    sessionId: 1,
    turnId,
  }));
  assert.equal(appendBetObservation(observations, { ...observations[0] }), observations);
  const next = appendBetObservation(observations, { sessionId: 1, turnId: MAX_BET_OBSERVATIONS });
  assert.equal(next.length, MAX_BET_OBSERVATIONS);
  assert.equal(next[0].turnId, 1);
  assert.equal(next.at(-1).turnId, MAX_BET_OBSERVATIONS);
  assert.equal(observations[0].turnId, 0, 'append leaves the prior list unchanged');
});

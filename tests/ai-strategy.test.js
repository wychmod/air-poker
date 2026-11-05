import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseCpuPlay, chooseCpuBet } from '../game/ai.js';
import { difficultyBetContext, estimateShowdown, betValue } from '../game/ai-betting.js';
import { createDeck, makeCandidates, judgeHand } from '../game/cards.js';
import { getBetOptions, applyBetAction } from '../game/betting.js';
import { chooseCpuPlay as legacyPlay } from '../scripts/strategy/legacy.js';
import { difficultyPolicy } from '../game/difficulty.js';
import { planDifficultyPlay } from '../game/ai-planning.js';

test('planning preserves a later solvable target instead of consuming the only useful cards', () => {
  const ids = new Set([
    '2-1',
    '13-0',
    '1-3',
    '13-2',
    '8-0',
    '1-0',
    '8-1',
    '11-0',
    '3-0',
    '2-3',
    '4-2',
    '10-2',
    '10-3',
  ]);
  const discard = createDeck().filter((card) => !ids.has(card.id));
  const targets = [37, 25];
  const before = structuredClone({ targets, discard });
  const greedy = legacyPlay(targets, [], discard, () => 0);
  assert.equal(makeCandidates(targets[1 - greedy.index], [...discard, ...greedy.hand]).length, 0);
  const planned = chooseCpuPlay(targets, [], discard, () => 0);
  assert.equal(judgeHand(planned.hand, planned.target, discard).valid, true);
  assert.ok(makeCandidates(targets[1 - planned.index], [...discard, ...planned.hand]).length > 0);
  assert.deepEqual({ targets, discard }, before);
});

test('extra strategy candidates remain legal and UI recommendation budget remains three', () => {
  const recommended = makeCandidates(35);
  const expanded = makeCandidates(35, [], 12);
  assert.equal(recommended.length, 3);
  assert.equal(expanded.length, 12);
  assert.deepEqual(expanded.slice(0, 3), recommended);
  for (const candidate of expanded) assert.equal(judgeHand(candidate.hand, 35).valid, true);
  for (const limit of [0, -1, 25, 1.5, NaN]) assert.throws(() => makeCandidates(35, [], limit));
});

test('calamity changes the value of an otherwise profitable call and costs use remaining reserve', () => {
  const options = { toCall: 1, potAfterCall: 6, reserve: 20 };
  const model = { win: 0.25, tie: 0, overlapLoss: 0 };
  assert.ok(betValue(model, options) > 0);
  assert.ok(betValue({ ...model, overlapLoss: 0.75 }, options) < 0);
  assert.ok(betValue(model, { ...options, toCall: 3 }) < 0);
  assert.equal(betValue({ win: 0, tie: 0, overlapLoss: 1 }, { ...options, reserve: 1 }), -1);
});

test('public candidate model is normalized, includes overlap loss, and reads only public information', () => {
  const hand = makeCandidates(24)[0].hand;
  const quiet = estimateShowdown(hand, 25, [], []);
  const pressure = estimateShowdown(hand, 25, [], [{ actor: 'player', raised: 3 }]);
  assert.ok(Math.abs(quiet.win + quiet.tie + quiet.lose - 1) < 1e-9);
  assert.ok(quiet.overlapLoss > 0 && quiet.overlapLoss <= quiet.lose);
  assert.ok(pressure.lose >= quiet.lose);
  assert.ok(quiet.samples <= 12);
  const base = {
    phase: 'bet',
    playerAir: 20,
    aiAir: 20,
    playerBet: 3,
    aiBet: 1,
    pot: 4,
    betting: { turn: 'ai', turnId: 1, checks: 0, history: [] },
  };
  const input = {
    hand,
    opponentTarget: 25,
    discard: [],
    history: [],
    options: getBetOptions(base, 'ai'),
  };
  for (const secret of ['playerHand', 'playerTargets', 'candidates', 'playerFailed'])
    Object.defineProperty(input, secret, {
      get() {
        throw new Error('Hidden data read');
      },
    });
  const before = structuredClone(input);
  const decision = chooseCpuBet(input, () => 0);
  assert.ok(applyBetAction(base, 'ai', decision.action, decision.amount));
  assert.deepEqual(input, before);
});

test('default and medium planning preserve the same seeded output and random calls', () => {
  const ids = new Set([
    '2-1',
    '13-0',
    '1-3',
    '13-2',
    '8-0',
    '1-0',
    '8-1',
    '11-0',
    '3-0',
    '2-3',
    '4-2',
    '10-2',
    '10-3',
  ]);
  const discard = createDeck().filter((card) => !ids.has(card.id));
  for (const seed of [1, 17, 311, 2026]) {
    let oldCalls = 0;
    let mediumCalls = 0;
    let oldSeed = seed;
    let mediumSeed = seed;
    const oldRandom = () => {
      oldCalls++;
      oldSeed = (Math.imul(oldSeed, 1664525) + 1013904223) >>> 0;
      return oldSeed / 4294967296;
    };
    const mediumRandom = () => {
      mediumCalls++;
      mediumSeed = (Math.imul(mediumSeed, 1664525) + 1013904223) >>> 0;
      return mediumSeed / 4294967296;
    };
    assert.deepEqual(
      chooseCpuPlay([37, 25], [], discard, oldRandom),
      chooseCpuPlay([37, 25], [], discard, mediumRandom, difficultyPolicy('medium')),
    );
    assert.equal(oldCalls, mediumCalls);
  }
});

test('no-policy play retains frozen pre-difficulty seeded output and random consumption', () => {
  const seeds = [1, 1234, 1234567, 2147483647, 4294967295];
  // Captured from the pre-difficulty planner, including distinct physical suits
  // and duplicate targets whose index must remain part of the chosen play.
  const fixtures = [
    {
      targets: [17, 24, 37, 30, 25],
      discard: [],
      expected: [
        [3, '4-0,5-0,6-0,7-0,8-0'],
        [3, '4-3,5-3,6-3,7-3,8-3'],
        [3, '4-3,5-3,6-3,7-3,8-3'],
        [3, '4-3,5-3,6-3,7-3,8-3'],
        [3, '4-0,5-0,6-0,7-0,8-0'],
      ],
    },
    {
      targets: [25, 25, 25, 25, 25],
      discard: [],
      expected: [
        [1, '3-0,4-0,5-0,6-0,7-0'],
        [3, '3-3,4-3,5-3,6-3,7-3'],
        [3, '3-0,4-0,5-0,6-0,7-0'],
        [3, '3-3,4-3,5-3,6-3,7-3'],
        [1, '3-0,4-0,5-0,6-0,7-0'],
      ],
    },
    {
      targets: [6, 7],
      discard: createDeck(),
      expected: [
        [0, null],
        [1, null],
        [1, null],
        [1, null],
        [0, null],
      ],
    },
  ];
  for (const fixture of fixtures) {
    for (let i = 0; i < seeds.length; i++) {
      let value = seeds[i];
      let calls = 0;
      const random = () => {
        calls++;
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 4294967296;
      };
      const play = chooseCpuPlay(fixture.targets, [], fixture.discard, random);
      assert.deepEqual(
        [play.index, play.hand?.map((card) => card.id).join(',') ?? null],
        fixture.expected[i],
      );
      assert.equal(calls, 1);
    }
  }
});

test('no-policy betting retains frozen pre-difficulty output and random consumption', () => {
  const seeds = [1, 1234, 1234567, 2147483647, 4294967295];
  const fixtures = [
    {
      ownTarget: 35,
      opponentTarget: 17,
      state: { playerBet: 1, aiBet: 1, pot: 2, playerAir: 20, aiAir: 20 },
      expected: { action: 'raise', amount: 1 },
      randomCalls: 1,
    },
    {
      ownTarget: 17,
      opponentTarget: 35,
      state: { playerBet: 6, aiBet: 1, pot: 7, playerAir: 20, aiAir: 20 },
      expected: { action: 'fold' },
      randomCalls: 0,
    },
    {
      ownTarget: 24,
      opponentTarget: 25,
      state: { playerBet: 3, aiBet: 1, pot: 4, playerAir: 20, aiAir: 20 },
      expected: { action: 'fold' },
      randomCalls: 0,
    },
  ];
  for (const fixture of fixtures) {
    for (const initialSeed of seeds) {
      let seed = initialSeed;
      let calls = 0;
      const random = () => {
        calls++;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const state = {
        ...fixture.state,
        phase: 'bet',
        betting: { turn: 'ai', turnId: 1, checks: 0, history: [] },
      };
      const decision = chooseCpuBet(
        {
          hand: makeCandidates(fixture.ownTarget)[0].hand,
          opponentTarget: fixture.opponentTarget,
          discard: [],
          options: getBetOptions(state, 'ai'),
          history: [],
        },
        random,
      );
      assert.deepEqual(decision, fixture.expected);
      assert.equal(calls, fixture.randomCalls);
    }
  }
});

test('beginner and medium adapt the current hand choice without producing invalid hands', () => {
  const ids = new Set([
    '2-1',
    '13-0',
    '1-3',
    '13-2',
    '8-0',
    '1-0',
    '8-1',
    '11-0',
    '3-0',
    '2-3',
    '4-2',
    '10-2',
    '10-3',
  ]);
  const discard = createDeck().filter((card) => !ids.has(card.id));
  const beginner = chooseCpuPlay([37, 25], [], discard, () => 0, difficultyPolicy('beginner'));
  const medium = chooseCpuPlay([37, 25], [], discard, () => 0, difficultyPolicy('medium'));
  assert.notEqual(beginner.index, medium.index);
  assert.equal(judgeHand(beginner.hand, beginner.target, discard).valid, true);
  assert.equal(judgeHand(medium.hand, medium.target, discard).valid, true);
});

test('hard planning stays within the cache-miss budget and falls back to valid roots', () => {
  const targets = [17, 24, 37, 30, 25];
  const policy = difficultyPolicy('hard');
  const planned = planDifficultyPlay(targets, [], [], () => 0, policy);
  assert.equal(planned.diagnostics.deepened, true);
  assert.equal(planned.diagnostics.budgetExhausted, false);
  assert.ok(planned.diagnostics.candidateCalls <= policy.maxCandidateCalls);
  assert.equal(judgeHand(planned.play.hand, planned.play.target).valid, true);

  const exhausted = planDifficultyPlay(targets, [], [], () => 0, {
    ...policy,
    maxCandidateCalls: targets.length,
  });
  assert.equal(exhausted.diagnostics.budgetExhausted, true);
  assert.equal(exhausted.diagnostics.deepened, false);
  assert.ok(exhausted.diagnostics.candidateCalls <= targets.length);
  assert.equal(judgeHand(exhausted.play.hand, exhausted.play.target).valid, true);
});

test('hard betting adapts to observed public behavior but ignores hidden fields', () => {
  const hand = makeCandidates(24)[0].hand;
  const base = {
    hand,
    opponentTarget: 25,
    discard: [],
    history: [{ actor: 'player', action: 'raise', raised: 2, turnId: 3 }],
    options: {
      active: true,
      toCall: 1,
      maxRaise: 4,
      reserve: 20,
      potAfterCall: 6,
      canCheck: false,
      canCall: true,
      canRaise: true,
      canFold: true,
      canAllIn: false,
    },
  };
  const habits = (raised, turnIds = [0, 1]) =>
    [0, 1].map((turnId) => ({
      sessionId: 1,
      round: 1,
      attemptId: 1,
      turnId: turnIds[turnId],
      actor: 'player',
      action: raised ? 'raise' : 'call',
      paid: raised ? 2 : 1,
      raised: raised ? 1 : 0,
      toCallBefore: 1,
      maxRaiseBefore: 2,
      canContinueBefore: true,
      timedOut: false,
    }));
  const hard = difficultyPolicy('hard');
  const aggressive = difficultyBetContext({ ...base, observations: habits(true) }, hard);
  const passive = difficultyBetContext({ ...base, observations: habits(false) }, hard);
  assert.notDeepEqual(aggressive.model, passive.model);

  const poison = { ...base, observations: habits(true) };
  Object.defineProperty(poison.observations[0], 'playerHand', {
    get() {
      throw new Error('Hidden data read');
    },
  });
  const visible = chooseCpuBet({ ...base, observations: habits(true) }, () => 0, hard);
  const hidden = chooseCpuBet(poison, () => 0, hard);
  assert.deepEqual(hidden, visible);
  const gameState = {
    phase: 'bet',
    playerAir: 20,
    aiAir: 20,
    playerBet: 3,
    aiBet: 1,
    pot: 4,
    betting: { turn: 'ai', turnId: 1, checks: 0, history: [] },
  };
  const legalInput = {
    ...base,
    options: getBetOptions(gameState, 'ai'),
    observations: habits(true),
  };
  const legalDecision = chooseCpuBet(legalInput, () => 0, hard);
  assert.ok(applyBetAction(gameState, 'ai', legalDecision.action, legalDecision.amount));
});

test('hard betting counts current raises once and still adapts to prior-round behavior', () => {
  const input = {
    hand: makeCandidates(24)[0].hand,
    opponentTarget: 25,
    discard: [],
    history: [{ actor: 'player', action: 'raise', raised: 2, turnId: 8 }],
    options: {
      active: true,
      toCall: 1,
      maxRaise: 4,
      reserve: 20,
      potAfterCall: 6,
      canCheck: false,
      canCall: true,
      canRaise: true,
      canFold: true,
      canAllIn: false,
    },
  };
  const hard = difficultyPolicy('hard');
  const current = {
    sessionId: 1,
    round: 2,
    attemptId: 1,
    turnId: 8,
    actor: 'player',
    action: 'raise',
    paid: 3,
    raised: 2,
    toCallBefore: 1,
    maxRaiseBefore: 4,
    canContinueBefore: true,
    timedOut: false,
  };
  assert.deepEqual(
    difficultyBetContext({ ...input, observations: [current] }, hard),
    difficultyBetContext({ ...input, observations: [] }, hard),
  );

  const priorActions = (raised) =>
    [2, 4].map((turnId) => ({
      ...current,
      round: 1,
      turnId,
      action: raised ? 'raise' : 'call',
      raised: raised ? 1 : 0,
    }));
  const aggressive = difficultyBetContext({ ...input, observations: priorActions(true) }, hard);
  const passive = difficultyBetContext({ ...input, observations: priorActions(false) }, hard);
  assert.notDeepEqual(aggressive.model, passive.model);
});

test('difficulty bets remain legal, never pay negative modeled value, and free weak hands check', () => {
  const states = [
    { playerAir: 20, aiAir: 20, playerBet: 1, aiBet: 1, pot: 2 },
    { playerAir: 6, aiAir: 6, playerBet: 18, aiBet: 12, pot: 30 },
    { playerAir: 20, aiAir: 2, playerBet: 3, aiBet: 1, pot: 4 },
    { playerAir: 1, aiAir: 20, playerBet: 3, aiBet: 1, pot: 4 },
    { playerAir: 20, aiAir: 20, playerBet: 6, aiBet: 1, pot: 7 },
  ].map((state) => ({
    ...state,
    phase: 'bet',
    betting: { turn: 'ai', turnId: 1, checks: 0, history: [] },
  }));
  for (const id of ['beginner', 'medium', 'hard']) {
    const policy = difficultyPolicy(id);
    for (const [ownTarget, opponentTarget] of [
      [17, 35],
      [24, 25],
      [35, 17],
    ]) {
      for (const state of states) {
        const input = {
          hand: makeCandidates(ownTarget)[0].hand,
          opponentTarget,
          discard: [],
          options: getBetOptions(state, 'ai'),
          history: [],
          observations: [],
        };
        for (const roll of [0, 0.5, 0.99]) {
          const decision = chooseCpuBet(input, () => roll, policy);
          const applied = applyBetAction(state, 'ai', decision.action, decision.amount);
          assert.ok(applied, `${id}: ${JSON.stringify(decision)}`);
          if (applied.event.paid > 0) {
            const { model } = difficultyBetContext(input, policy);
            assert.ok(betValue(model, input.options, applied.event.raised) >= -1e-9);
          }
          if (ownTarget === 17 && opponentTarget === 35 && input.options.canCheck)
            assert.equal(decision.action, 'check');
        }
      }
    }
  }
});

test('hard risk weight folds a marginal positive-value call at a fixed boundary', () => {
  const state = {
    phase: 'bet',
    playerAir: 2,
    aiAir: 8,
    playerBet: 2,
    aiBet: 0,
    pot: 2,
    betting: { turn: 'ai', turnId: 1, checks: 0, history: [] },
  };
  const input = {
    hand: makeCandidates(10)[0].hand,
    opponentTarget: 10,
    discard: [],
    history: [],
    observations: [],
    options: getBetOptions(state, 'ai'),
  };
  const hard = difficultyPolicy('hard');
  const previousRisk = { ...hard, riskWeight: 0.08 };
  const model = difficultyBetContext(input, hard).model;
  const callValue = betValue(model, input.options);
  assert.equal(hard.riskWeight, 0.16);
  assert.ok(callValue > 0);

  const previousDecision = chooseCpuBet(input, () => 0, previousRisk);
  const hardDecision = chooseCpuBet(input, () => 0, hard);
  assert.deepEqual(previousDecision, { action: 'call' });
  assert.deepEqual(hardDecision, { action: 'fold' });
  assert.ok(applyBetAction(state, 'ai', previousDecision.action, previousDecision.amount));
  assert.ok(applyBetAction(state, 'ai', hardDecision.action, hardDecision.amount));
});

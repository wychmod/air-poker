import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { makeCandidates, judgeHand } from '../game/cards.js';
import { planDifficultyPlay } from '../game/ai-planning.js';
import { dealTargets } from '../game/deal.js';
import { DIFFICULTY_IDS, difficultyPolicy } from '../game/difficulty.js';
import { createOpponent } from '../game/opponents.js';
import {
  simulateMatch,
  comparePolicies,
  seeded,
  summarizePairedDelta,
} from '../scripts/strategy/simulate.js';

test('isolated deal source reproduces the same deal and swapping reverses both hands', () => {
  function hands(swapSides, strategyRoll) {
    let privateTargets;
    const game = createGame({
      dealRandom: seeded(91),
      random: () => strategyRoll,
      swapSides,
      opponent: {
        choosePlay: (targets, used, discard) => {
          privateTargets = [...targets];
          targets[0] = 999;
          used.push(4);
          discard.push({ id: 'invalid' });
          return { index: 0, target: privateTargets[0], hand: null, rank: null };
        },
        chooseBet: () => ({ action: 'check' }),
      },
    });
    const state = game.getState();
    assert.deepEqual(state.discard, []);
    assert.deepEqual(state.usedTargets, []);
    game.dispatch({ type: 'choose-target', index: 0 });
    assert.equal(game.getState().aiTarget, privateTargets[0]);
    assert.equal(game.getState().aiRemaining, 4);
    return { player: state.targets, opponent: privateTargets };
  }
  const normal = hands(false, 0);
  assert.deepEqual(hands(false, 0.99), normal);
  assert.deepEqual(hands(true, 0), { player: normal.opponent, opponent: normal.player });
});

test('whole-engine simulations are deterministic, conserve AIR, and validate completed records', () => {
  const first = simulateMatch({ seed: 4 });
  assert.deepEqual(simulateMatch({ seed: 4 }), first);
  for (const opponent of ['legacy', 'passive', 'aggressive', 'random']) {
    const result = simulateMatch({ seed: 8, player: 'current', opponent, slow: true });
    assert.equal(result.balanced, true);
    assert.ok(['player', 'ai', 'tie'].includes(result.winner));
    assert.ok(result.rounds <= 5);
  }
  const report = comparePolicies('legacy', 'legacy', { seeds: 2 });
  assert.equal(report.matches, 4);
  assert.equal(report.wins + report.ties + report.losses, 4);
  assert.equal(report.allBalanced, true);
});

test('policy input mutation and retained return objects cannot modify authoritative hands or accounts', () => {
  let returned;
  let called = false;
  const game = createGame({
    random: seeded(17),
    opponent: {
      choosePlay: (targets) => {
        returned = { index: 0, target: targets[0], ...makeCandidates(targets[0])[0] };
        return returned;
      },
      chooseBet: (input) => {
        called = true;
        const action = input.options.canCall ? 'call' : 'check';
        input.hand[0].value = 999;
        input.discard.push({ id: 'fake' });
        input.options.reserve = -100;
        input.history.push({ actor: 'fake' });
        return { action };
      },
    },
  });
  const target = returned.target;
  returned.target = 999;
  returned.hand[0].value = 999;
  assert.equal(game.dispatch({ type: 'choose-target', index: 0 }), true);
  assert.equal(game.getState().aiTarget, target);
  game.dispatch({ type: 'confirm-hand', attemptId: game.getState().upper.attemptId });
  for (let step = 0; game.getState().phase === 'bet'; step++) {
    assert.ok(step < 50);
    const state = game.getState();
    assert.equal(
      game.dispatch(
        state.betting.turn === 'ai'
          ? { type: 'cpu-bet', turnId: state.betting.turnId }
          : {
              type: 'bet',
              action: state.legalBets.canCall ? 'call' : 'check',
              turnId: state.betting.turnId,
            },
      ),
      true,
    );
  }
  const state = game.getState();
  assert.equal(called, true);
  assert.equal(judgeHand(state.aiHand, target).valid, true);
  assert.equal(state.accounting.balanced, true);
  assert.equal(
    state.discard.some((card) => card.id === 'fake'),
    false,
  );
  assert.equal(
    state.betting.history.some((event) => event.actor === 'fake'),
    false,
  );
});

test('difficulty simulations inject only the engine opponent and finish both swapped slow games', () => {
  for (const opponent of DIFFICULTY_IDS) {
    for (const swapSides of [false, true]) {
      const result = simulateMatch({
        seed: 103,
        player: 'legacy',
        opponent,
        swapSides,
        slow: true,
      });
      assert.equal(result.opponent, opponent);
      assert.equal(result.player, 'legacy');
      assert.equal(result.balanced, true);
      assert.ok(result.decisionCounts.planning > 0);
      assert.ok(result.opponentTargets.observed > 0);
      assert.ok(['player', 'ai', 'tie'].includes(result.winner));
    }
  }
});

test('difficulty planner diagnostics are deterministic and aggregate actual planning work', () => {
  const seed = 211;
  const targets = dealTargets(seeded(seed)).ai.map((group) => group.target);
  const opponentRandom = seeded(seed ^ 0x31415926);
  const plannerRandom = seeded(seed ^ 0x31415926);
  const opponentPlay = createOpponent('hard').choosePlay(targets, [], [], opponentRandom);
  const planned = planDifficultyPlay(targets, [], [], plannerRandom, difficultyPolicy('hard'));
  assert.deepEqual(opponentPlay, planned.play);
  assert.equal(opponentRandom(), plannerRandom(), 'planner consumes the same random stream');

  const first = simulateMatch({ seed, player: 'legacy', opponent: 'hard' });
  const second = simulateMatch({ seed, player: 'legacy', opponent: 'hard' });
  assert.deepEqual(first, second);
  assert.ok(first.planningDiagnostics.candidateCalls > 0);
  assert.ok(first.planningDiagnostics.maxCandidateCalls <= 256);
  assert.ok(
    first.planningDiagnostics.candidateCalls >= first.planningDiagnostics.maxCandidateCalls,
  );
  assert.ok(first.planningDiagnostics.deepened >= 0);
  assert.ok(first.planningDiagnostics.budgetExhausted >= 0);

  const swapped = simulateMatch({ seed, player: 'legacy', opponent: 'hard', swapSides: true });
  const report = comparePolicies('legacy', 'hard', {
    seeds: 1,
    startSeed: seed,
    perspective: 'opponent',
  });
  assert.deepEqual(report.planningDiagnostics, {
    candidateCalls:
      first.planningDiagnostics.candidateCalls + swapped.planningDiagnostics.candidateCalls,
    maxCandidateCalls: Math.max(
      first.planningDiagnostics.maxCandidateCalls,
      swapped.planningDiagnostics.maxCandidateCalls,
    ),
    deepened: first.planningDiagnostics.deepened + swapped.planningDiagnostics.deepened,
    budgetExhausted:
      first.planningDiagnostics.budgetExhausted + swapped.planningDiagnostics.budgetExhausted,
  });
  assert.ok(report.planningDiagnostics.maxCandidateCalls <= 256);
  assert.equal(
    Object.hasOwn(simulateMatch({ seed, opponent: 'legacy' }), 'planningDiagnostics'),
    false,
  );
  assert.equal(
    Object.hasOwn(comparePolicies('legacy', 'legacy', { seeds: 1 }), 'planningDiagnostics'),
    false,
  );
});

test('opponent-perspective benchmark reverses scores and AIR gaps without changing matches', () => {
  const config = { seeds: 2, startSeed: 71 };
  const player = comparePolicies('legacy', 'medium', config);
  const opponent = comparePolicies('legacy', 'medium', { ...config, perspective: 'opponent' });
  assert.equal(opponent.perspective, 'opponent');
  assert.equal(opponent.matches, player.matches);
  assert.equal(opponent.wins, player.losses);
  assert.equal(opponent.losses, player.wins);
  assert.equal(opponent.ties, player.ties);
  assert.equal(opponent.score + player.score, 1);
  assert.equal(opponent.meanAirDifference, -player.meanAirDifference);
  assert.equal(opponent.meanAirGap, opponent.meanAirDifference);
  assert.equal(opponent.winScore, opponent.score);
  assert.equal(opponent.allBalanced, true);
  assert.deepEqual(opponent.decisionCounts, player.decisionCounts);
  assert.ok(opponent.approximate95Interval.every((value) => value >= 0 && value <= 1));
});

test('paired difficulty samples are deterministic and deltas keep their direction', () => {
  const config = {
    startSeed: 43,
    seeds: 2,
    perspective: 'opponent',
    includePairedSamples: true,
  };
  const first = comparePolicies('legacy', 'hard', config);
  const second = comparePolicies('legacy', 'hard', config);
  assert.deepEqual(first.pairedSamples, second.pairedSamples);
  assert.deepEqual(
    first.pairedSamples.map(({ seed }) => seed),
    [43, 44],
  );

  const candidate = [
    { seed: 1, score: 0.5, meanAirDifference: 3 },
    { seed: 2, score: 0.25, meanAirDifference: 1 },
  ];
  const medium = [
    { seed: 1, score: 0.75, meanAirDifference: 5 },
    { seed: 2, score: 0.5, meanAirDifference: 4 },
  ];
  const delta = summarizePairedDelta(candidate, medium);
  assert.equal(delta.seeds, 2);
  assert.deepEqual(delta.score, { mean: -0.25, interval95: [-0.25, -0.25] });
  assert.equal(delta.meanAirDifference.mean, -2.5);
  assert.deepEqual(delta.meanAirDifference.interval95, [-3.48, -1.52]);
  assert.deepEqual(summarizePairedDelta(medium, medium), {
    seeds: 2,
    score: { mean: 0, interval95: [0, 0] },
    meanAirDifference: { mean: 0, interval95: [0, 0] },
  });
  assert.throws(
    () =>
      summarizePairedDelta(
        candidate,
        medium.map((sample) => ({ ...sample, seed: 0 })),
      ),
    /same seeds/,
  );
});

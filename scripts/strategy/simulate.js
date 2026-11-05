import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createGame } from '../../game/engine.js';
import { makeCandidates } from '../../game/cards.js';
import { dealTargets } from '../../game/deal.js';
import { compareRanks } from '../../game/rules.js';
import { isCompletedRecord } from '../../game/records.js';
import { chooseCpuPlay, chooseCpuBet } from '../../game/ai.js';
import { planDifficultyPlay } from '../../game/ai-planning.js';
import { chooseCpuPlay as legacyPlay, chooseCpuBet as legacyBet } from './legacy.js';
import { createOpponent } from '../../game/opponents.js';
import { difficultyPolicy, isDifficultyId } from '../../game/difficulty.js';

export function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function policy(name) {
  const passiveBet = ({ options }) => ({ action: options.canCall ? 'call' : 'check' });
  switch (name) {
    case 'current':
      return { choosePlay: chooseCpuPlay, chooseBet: chooseCpuBet };
    case 'betting':
      return { choosePlay: legacyPlay, chooseBet: chooseCpuBet };
    case 'planning':
      return { choosePlay: chooseCpuPlay, chooseBet: legacyBet };
    case 'legacy':
      return { choosePlay: legacyPlay, chooseBet: legacyBet };
    case 'passive':
      return { choosePlay: legacyPlay, chooseBet: passiveBet };
    case 'aggressive':
      return {
        choosePlay: legacyPlay,
        chooseBet: ({ options }) =>
          options.canRaise
            ? { action: 'raise', amount: options.maxRaise }
            : passiveBet({ options }),
      };
    case 'random':
      return {
        choosePlay: (targets, used, discard, random) => {
          const indices = targets.flatMap((_, i) => (used.includes(i) ? [] : [i]));
          const index = indices[Math.floor(random() * indices.length)];
          if (index === undefined) return null;
          const candidates = makeCandidates(targets[index], discard);
          const candidate = candidates[Math.floor(random() * candidates.length)];
          return { index, target: targets[index], hand: null, rank: null, ...candidate };
        },
        chooseBet: passiveBet,
      };
    default:
      throw new RangeError('Unknown policy: ' + name);
  }
}

export function simulateMatch({
  seed,
  player = 'legacy',
  opponent = 'legacy',
  swapSides = false,
  slow = false,
  measure = false,
}) {
  const playerPolicy = policy(player);
  const playerRandom = seeded(seed ^ 0x9e3779b9);
  const opponentDifficultyPolicy = isDifficultyId(opponent) ? difficultyPolicy(opponent) : null;
  const difficultyOpponent = opponentDifficultyPolicy !== null;
  const opponentPolicy = difficultyOpponent ? createOpponent(opponent) : policy(opponent);
  const planningDiagnostics = {
    candidateCalls: 0,
    maxCandidateCalls: 0,
    deepened: 0,
    budgetExhausted: 0,
  };
  const decisionCounts = { planning: 0, betting: 0 };
  const timings = { planningMs: 0, bettingMs: 0, maxPlanningMs: 0, maxBettingMs: 0 };
  const opponentTargets = { unsolvable: 0, observed: 0 };
  function measuredDecision(kind, decide, args) {
    decisionCounts[kind]++;
    if (!measure) return decide(...args);
    const start = performance.now();
    const decision = decide(...args);
    const elapsed = performance.now() - start;
    timings[kind + 'Ms'] += elapsed;
    const maxKey = kind === 'planning' ? 'maxPlanningMs' : 'maxBettingMs';
    timings[maxKey] = Math.max(timings[maxKey], elapsed);
    return decision;
  }
  const game = createGame({
    dealRandom: seeded(seed),
    random: seeded(seed ^ 0x85ebca6b),
    opponent: {
      choosePlay: (...args) => {
        const decision = measuredDecision(
          'planning',
          (...playArgs) => {
            if (!difficultyOpponent) return opponentPolicy.choosePlay(...playArgs);
            const { play, diagnostics } = planDifficultyPlay(...playArgs, opponentDifficultyPolicy);
            assert.ok(diagnostics.candidateCalls <= 256, 'Planner exceeded its candidate budget');
            planningDiagnostics.candidateCalls += diagnostics.candidateCalls;
            planningDiagnostics.maxCandidateCalls = Math.max(
              planningDiagnostics.maxCandidateCalls,
              diagnostics.candidateCalls,
            );
            planningDiagnostics.deepened += Number(diagnostics.deepened);
            planningDiagnostics.budgetExhausted += Number(diagnostics.budgetExhausted);
            return play;
          },
          args,
        );
        opponentTargets.observed += Number(Boolean(decision));
        opponentTargets.unsolvable += Number(Boolean(decision) && !decision.hand);
        return decision;
      },
      chooseBet: (...args) => measuredDecision('betting', opponentPolicy.chooseBet, args),
    },
    swapSides,
    recordId: 'simulation-' + seed,
  });
  let steps = 0;
  let plannedHand;
  let bankroll;
  const result = {
    seed,
    swapSides,
    player,
    opponent,
    failedHands: { player: 0, ai: 0 },
    calamities: 0,
    burned: 0,
    folds: { player: 0, ai: 0 },
    unsolvable: 0,
    unusedObservations: 0,
    decisionCounts,
    opponentTargets,
    ...(difficultyOpponent ? { planningDiagnostics } : {}),
  };
  function act(action) {
    assert.equal(
      game.dispatch(action),
      true,
      'Rejected simulation action: ' + JSON.stringify(action),
    );
    const state = game.getState();
    assert.equal(state.accounting.balanced, true);
    assert.equal(state.accounting.accountedTotal, 50);
    for (const value of [state.playerAir, state.aiAir, state.pot])
      assert.ok(Number.isInteger(value) && value >= 0);
  }
  function advance(ms) {
    const state = game.getState();
    act({
      type: 'elapse',
      sessionId: state.sessionId,
      elapsedMs: state.respiration.elapsedMs + ms,
    });
  }
  while (game.getState().phase !== 'summary') {
    assert.ok(++steps < 500, 'Match must terminate');
    let state = game.getState();
    switch (state.phase) {
      case 'lower': {
        advance(1000);
        state = game.getState();
        if (state.phase !== 'lower') break;
        state.targetPlayable.forEach((ok, index) => {
          if (ok) {
            result.unusedObservations++;
            if (!state.targetSolvable[index]) result.unsolvable++;
          }
        });
        const play = playerPolicy.choosePlay(
          state.targets,
          state.usedTargets,
          state.discard,
          playerRandom,
        );
        assert.ok(play);
        plannedHand = play.hand;
        act({ type: 'choose-target', index: play.index });
        break;
      }
      case 'upper': {
        if (state.upper.retry)
          plannedHand = makeCandidates(state.playerTarget, state.discard)[0]?.hand;
        advance(slow ? 55000 : 12000);
        state = game.getState();
        if (state.phase !== 'upper') break;
        act(
          plannedHand
            ? { type: 'submit-hand', hand: plannedHand, attemptId: state.upper.attemptId }
            : { type: 'fail-hand', attemptId: state.upper.attemptId },
        );
        break;
      }
      case 'bet': {
        if (state.betting.turn === 'ai') {
          advance(state.betting.deadlineMs - state.respiration.elapsedMs);
        } else {
          advance(600);
          state = game.getState();
          if (state.phase !== 'bet' || state.betting.turn !== 'player') break;
          // Policies use "player" for the public opponent. Never pass the other hand.
          const decision = playerPolicy.chooseBet(
            {
              hand: state.playerHand,
              opponentTarget: state.aiTarget,
              discard: state.discard,
              options: state.legalBets,
              history: state.betting.history.map((event) => ({
                ...event,
                actor: event.actor === 'ai' ? 'player' : 'ai',
              })),
            },
            playerRandom,
          );
          act({ type: 'bet', ...decision, turnId: state.betting.turnId });
        }
        break;
      }
      case 'showdown': {
        const settled = state.lastResult;
        for (const actor of ['player', 'ai']) {
          result.failedHands[actor] += Number(settled.upperFailed[actor]);
          result.folds[actor] += Number(settled.foldedBy === actor);
        }
        result.calamities += Number(settled.calamity);
        result.burned += settled.burned;
        act({ type: 'advance-round' });
        break;
      }
      case 'endurance':
        bankroll = { player: state.playerAir, ai: state.aiAir };
        act({ type: 'fast-forward', sessionId: state.sessionId });
        break;
      default:
        throw new Error('Unexpected phase ' + state.phase);
    }
  }
  const final = game.getState();
  assert.equal(isCompletedRecord(game.getRecord()), true, 'Completed record must validate');
  return {
    ...result,
    winner: final.winner,
    rounds: final.completedRounds,
    bankroll: bankroll ?? { player: final.playerAir, ai: final.aiAir },
    end: final.enduranceReason,
    balanced: final.accounting.balanced,
    ...(measure ? { timings } : {}),
  };
}

export function comparePolicies(
  player,
  opponent,
  {
    startSeed = 1,
    seeds = 20,
    slow = false,
    perspective = 'player',
    measure = false,
    includePairedSamples = false,
  } = {},
) {
  if (!['player', 'opponent'].includes(perspective))
    throw new RangeError('perspective must be player or opponent');
  const actor = perspective === 'opponent' ? 'ai' : 'player';
  const other = actor === 'ai' ? 'player' : 'ai';
  const rows = [];
  for (let seed = startSeed; seed < startSeed + seeds; seed++)
    for (const swapSides of [false, true])
      rows.push(simulateMatch({ seed, player, opponent, swapSides, slow, measure }));
  const wins = rows.filter((row) => row.winner === actor).length;
  const ties = rows.filter((row) => row.winner === 'tie').length;
  const points = rows.map((row) => (row.winner === actor ? 1 : row.winner === 'tie' ? 0.5 : 0));
  // Both swapped games form one statistical unit; they share the same deal.
  const paired = Array.from({ length: seeds }, (_, i) => (points[2 * i] + points[2 * i + 1]) / 2);
  const pairedSamples = Array.from({ length: seeds }, (_, i) => ({
    seed: startSeed + i,
    score: paired[i],
    meanAirDifference:
      (rows[2 * i].bankroll[actor] -
        rows[2 * i].bankroll[other] +
        rows[2 * i + 1].bankroll[actor] -
        rows[2 * i + 1].bankroll[other]) /
      2,
  }));
  const score = points.reduce((a, b) => a + b, 0) / rows.length;
  const se =
    seeds > 1
      ? Math.sqrt(paired.reduce((sum, p) => sum + (p - score) ** 2, 0) / (seeds - 1) / seeds)
      : null;
  const sum = (fn) => rows.reduce((total, row) => total + fn(row), 0);
  return {
    player,
    opponent,
    perspective,
    startSeed,
    seeds,
    matches: rows.length,
    wins,
    ties,
    losses: rows.length - wins - ties,
    score,
    winScore: score,
    approximate95Interval:
      se === null ? null : [Math.max(0, score - 1.96 * se), Math.min(1, score + 1.96 * se)],
    meanAirGain: sum((row) => row.bankroll[actor] - 24) / rows.length,
    meanAirDifference: sum((row) => row.bankroll[actor] - row.bankroll[other]) / rows.length,
    meanAirGap: sum((row) => row.bankroll[actor] - row.bankroll[other]) / rows.length,
    failedHands: {
      player: sum((row) => row.failedHands.player),
      opponent: sum((row) => row.failedHands.ai),
    },
    unsolvableTargetRate:
      sum((row) => (actor === 'ai' ? row.opponentTargets.unsolvable : row.unsolvable)) /
      Math.max(
        1,
        sum((row) => (actor === 'ai' ? row.opponentTargets.observed : row.unusedObservations)),
      ),
    calamities: sum((row) => row.calamities),
    burned: sum((row) => row.burned),
    folds: {
      player: sum((row) => row.folds.player),
      opponent: sum((row) => row.folds.ai),
    },
    meanRounds: sum((row) => row.rounds) / rows.length,
    allBalanced: rows.every((row) => row.balanced),
    decisionCounts: {
      planning: sum((row) => row.decisionCounts.planning),
      betting: sum((row) => row.decisionCounts.betting),
    },
    ...(isDifficultyId(opponent)
      ? {
          planningDiagnostics: {
            candidateCalls: sum((row) => row.planningDiagnostics.candidateCalls),
            maxCandidateCalls: Math.max(
              ...rows.map((row) => row.planningDiagnostics.maxCandidateCalls),
            ),
            deepened: sum((row) => row.planningDiagnostics.deepened),
            budgetExhausted: sum((row) => row.planningDiagnostics.budgetExhausted),
          },
        }
      : {}),
    ...(measure
      ? {
          timings: {
            planningMs: sum((row) => row.timings.planningMs),
            bettingMs: sum((row) => row.timings.bettingMs),
            maxPlanningMs: Math.max(...rows.map((row) => row.timings.maxPlanningMs)),
            maxBettingMs: Math.max(...rows.map((row) => row.timings.maxBettingMs)),
          },
        }
      : {}),
    ...(includePairedSamples ? { pairedSamples } : {}),
  };
}

function summarizeDelta(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length < 2) return { mean, interval95: null };
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  const margin = 1.96 * Math.sqrt(variance / values.length);
  return { mean, interval95: [mean - margin, mean + margin] };
}

export function summarizePairedDelta(samples, referenceSamples) {
  if (
    samples.length !== referenceSamples.length ||
    samples.some((sample, index) => sample.seed !== referenceSamples[index].seed)
  )
    throw new RangeError('Paired samples must use the same seeds in the same order');
  return {
    seeds: samples.length,
    score: summarizeDelta(
      samples.map((sample, index) => sample.score - referenceSamples[index].score),
    ),
    meanAirDifference: summarizeDelta(
      samples.map(
        (sample, index) => sample.meanAirDifference - referenceSamples[index].meanAirDifference,
      ),
    ),
  };
}

export function auditDeals(startSeed = 1, seeds = 1000) {
  const best = new Map(
    Array.from({ length: 59 }, (_, i) => [i + 6, makeCandidates(i + 6)[0].rank]),
  );
  const result = {
    seeds,
    sumGapAtMostOne: 0,
    maxSumGap: 0,
    bestRankDifferent: 0,
    playerBestStronger: 0,
    opponentBestStronger: 0,
    bestRankTied: 0,
  };
  for (let seed = startSeed; seed < startSeed + seeds; seed++) {
    const { player, ai } = dealTargets(seeded(seed));
    const gap = Math.abs(
      player.reduce((s, g) => s + g.target, 0) - ai.reduce((s, g) => s + g.target, 0),
    );
    result.sumGapAtMostOne += Number(gap <= 1);
    result.maxSumGap = Math.max(result.maxSumGap, gap);
    const strongest = (groups) =>
      groups.map((g) => best.get(g.target)).sort((a, b) => compareRanks(b, a))[0];
    const comparison = compareRanks(strongest(player), strongest(ai));
    result.bestRankDifferent += Number(comparison !== 0);
    result.playerBestStronger += Number(comparison > 0);
    result.opponentBestStronger += Number(comparison < 0);
    result.bestRankTied += Number(comparison === 0);
  }
  return result;
}

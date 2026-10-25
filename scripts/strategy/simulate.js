import assert from 'node:assert/strict';
import { createGame } from '../../game/engine.js';
import { makeCandidates } from '../../game/cards.js';
import { dealTargets } from '../../game/deal.js';
import { compareRanks } from '../../game/rules.js';
import { isCompletedRecord } from '../../game/records.js';
import { chooseCpuPlay, chooseCpuBet } from '../../game/ai.js';
import { chooseCpuPlay as legacyPlay, chooseCpuBet as legacyBet } from './legacy.js';

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
}) {
  const playerPolicy = policy(player);
  const playerRandom = seeded(seed ^ 0x9e3779b9);
  const game = createGame({
    dealRandom: seeded(seed),
    random: seeded(seed ^ 0x85ebca6b),
    opponent: policy(opponent),
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
  };
}

export function comparePolicies(
  player,
  opponent,
  { startSeed = 1, seeds = 20, slow = false } = {},
) {
  const rows = [];
  for (let seed = startSeed; seed < startSeed + seeds; seed++)
    for (const swapSides of [false, true])
      rows.push(simulateMatch({ seed, player, opponent, swapSides, slow }));
  const wins = rows.filter((row) => row.winner === 'player').length;
  const ties = rows.filter((row) => row.winner === 'tie').length;
  const points = rows.map((row) => (row.winner === 'player' ? 1 : row.winner === 'tie' ? 0.5 : 0));
  // Both swapped games form one statistical unit; they share the same deal.
  const paired = Array.from({ length: seeds }, (_, i) => (points[2 * i] + points[2 * i + 1]) / 2);
  const score = points.reduce((a, b) => a + b, 0) / rows.length;
  const se =
    seeds > 1
      ? Math.sqrt(paired.reduce((sum, p) => sum + (p - score) ** 2, 0) / (seeds - 1) / seeds)
      : null;
  const sum = (fn) => rows.reduce((total, row) => total + fn(row), 0);
  return {
    player,
    opponent,
    startSeed,
    seeds,
    matches: rows.length,
    wins,
    ties,
    losses: rows.length - wins - ties,
    score,
    approximate95Interval:
      se === null ? null : [Math.max(0, score - 1.96 * se), Math.min(1, score + 1.96 * se)],
    meanAirGain: sum((row) => row.bankroll.player - 24) / rows.length,
    meanAirDifference: sum((row) => row.bankroll.player - row.bankroll.ai) / rows.length,
    failedHands: {
      player: sum((row) => row.failedHands.player),
      opponent: sum((row) => row.failedHands.ai),
    },
    unsolvableTargetRate:
      sum((row) => row.unsolvable) /
      Math.max(
        1,
        sum((row) => row.unusedObservations),
      ),
    calamities: sum((row) => row.calamities),
    burned: sum((row) => row.burned),
    folds: { player: sum((row) => row.folds.player), opponent: sum((row) => row.folds.ai) },
    meanRounds: sum((row) => row.rounds) / rows.length,
    allBalanced: rows.every((row) => row.balanced),
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

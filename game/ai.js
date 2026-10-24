import { makeCandidates } from './cards.js';
import { randomIndex } from './deal.js';
import { compareRanks, rankHand } from './rules.js';

// Deliberately receives no opponent target, hand, candidate or future cards.
export function chooseCpuPlay(targets, usedTargets, discard, random = Math.random) {
  const plays = targets.flatMap((target, index) => {
    if (usedTargets.includes(index)) return [];
    return makeCandidates(target, discard).map((candidate) => ({ index, target, ...candidate }));
  });
  if (!plays.length) {
    const remaining = targets.flatMap((target, index) =>
      usedTargets.includes(index) ? [] : [{ index, target, hand: null, rank: null }],
    );
    return remaining.length ? remaining[randomIndex(random, remaining.length)] : null;
  }
  plays.sort((a, b) => compareRanks(b.rank, a.rank));
  const strongest = plays.filter((play) => compareRanks(play.rank, plays[0].rank) === 0);
  return strongest[randomIndex(random, strongest.length)];
}

// Inputs contain our private hand and public information only. Comparing to
// the opponent's best legal recommendation is a heuristic, not a win rate.
export function chooseCpuBet(
  { hand, opponentTarget, discard, options, history },
  random = Math.random,
) {
  if (!options.active) return null;
  if (!hand) return { action: options.canCall ? 'fold' : 'check' };
  const opponentBest = makeCandidates(opponentTarget, discard)[0];
  const ownRank = rankHand(hand);
  const comparison = opponentBest ? compareRanks(ownRank, opponentBest.rank) : 1;
  const confidence =
    comparison > 0
      ? 0.9
      : comparison === 0
        ? 0.6
        : Math.max(
            0.15,
            0.5 - Math.max(0, (opponentBest?.rank.category ?? 0) - ownRank.category) * 0.08,
          );
  const roll = randomIndex(random, 1000) / 1000;
  const publicPressure = history.filter(
    (event) => event.actor === 'player' && event.raised > 0,
  ).length;
  const price = options.toCall / Math.max(1, options.potAfterCall);
  const reserveRisk = options.toCall / Math.max(1, options.reserve);
  if (
    options.canFold &&
    options.toCall > 0 &&
    confidence < 0.65 &&
    (reserveRisk >= 0.5 || price + publicPressure * 0.06 > confidence) &&
    roll > 0.12
  )
    return { action: 'fold' };
  const aggression = confidence > 0.75 ? 0.65 : confidence >= 0.55 ? 0.25 : 0.06;
  if (options.canRaise && roll < aggression) {
    if (
      options.canAllIn &&
      options.allInCost === options.toCall + options.maxRaise &&
      confidence > 0.75
    )
      return { action: 'all-in' };
    return { action: 'raise', amount: confidence > 0.75 ? options.maxRaise : 1 };
  }
  return { action: options.canCall ? 'call' : 'check' };
}

import { makeCandidates } from './cards.js';
import { randomIndex } from './deal.js';

// Preserve lexicographic kickers without mistaking rankHand.score for full rank.
export function handStrength(rank) {
  return rank
    ? rank.category + 1 + rank.tie.reduce((sum, value, i) => sum + value / 15 ** (i + 1), 0)
    : 0;
}

export function choosePlannedPlay(targets, usedTargets, discard, random = Math.random, policy) {
  if (policy) return planDifficultyPlay(targets, usedTargets, discard, random, policy).play;
  const remaining = targets.flatMap((target, index) =>
    usedTargets.includes(index) ? [] : [{ index, target }],
  );
  if (!remaining.length) return null;
  const cache = new Map();
  function candidates(target, removed, limit = 3) {
    const key =
      target +
      ':' +
      limit +
      ':' +
      removed
        .map((card) => card.id)
        .sort()
        .join(',');
    if (!cache.has(key)) cache.set(key, makeCandidates(target, removed, limit));
    return cache.get(key);
  }
  const plays = [];
  for (const { index, target } of remaining) {
    const choices = candidates(target, discard, 12);
    if (!choices.length) continue;
    const first = choices[0];
    const pattern = (hand) =>
      hand
        .map((card) => card.value)
        .sort((a, b) => a - b)
        .join(',');
    const tied = choices.filter((choice) => handStrength(choice.rank) === handStrength(first.rank));
    // At most three representatives per target: strongest, alternative suits,
    // and a different rank multiset. UI recommendations still default to three.
    const representatives = [
      first,
      tied.at(-1),
      choices.find((choice) => pattern(choice.hand) !== pattern(first.hand)),
    ];
    const seen = new Set();
    for (const choice of representatives) {
      if (!choice) continue;
      const id = choice.hand
        .map((card) => card.id)
        .sort()
        .join(',');
      if (seen.has(id)) continue;
      seen.add(id);
      const removed = [...discard, ...choice.hand];
      let future = 0;
      for (const other of remaining) {
        if (other.index === index) continue;
        const next = candidates(other.target, removed, 1)[0];
        future += next ? 0.04 * handStrength(next.rank) : -2.5;
      }
      plays.push({ index, target, ...choice, utility: handStrength(choice.rank) + future });
    }
  }
  if (!plays.length)
    return { ...remaining[randomIndex(random, remaining.length)], hand: null, rank: null };
  const best = Math.max(...plays.map((play) => play.utility));
  const tied = plays.filter((play) => Math.abs(play.utility - best) < 1e-9);
  const { utility, ...play } = tied[randomIndex(random, tied.length)];
  return play;
}

function representatives(choices) {
  if (!choices.length) return [];
  const first = choices[0];
  const pattern = (hand) =>
    hand
      .map((card) => card.value)
      .sort((a, b) => a - b)
      .join(',');
  const tied = choices.filter((choice) => handStrength(choice.rank) === handStrength(first.rank));
  const seen = new Set();
  return [
    first,
    tied.at(-1),
    choices.find((choice) => pattern(choice.hand) !== pattern(first.hand)),
  ].filter((choice) => {
    if (!choice) return false;
    const key = choice.hand
      .map((card) => card.id)
      .sort()
      .join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Diagnostic counts are returned by this pure helper for tests/tools only.
// The engine-facing entry returns just the chosen play, without callbacks or clocks.
export function planDifficultyPlay(targets, usedTargets, discard, random, policy) {
  const remaining = targets.flatMap((target, index) =>
    usedTargets.includes(index) ? [] : [{ index, target }],
  );
  const diagnostics = { candidateCalls: 0, deepened: false, budgetExhausted: false };
  if (!remaining.length) return { play: null, diagnostics };
  const budget = Math.max(remaining.length, Math.min(256, policy.maxCandidateCalls));
  const cache = new Map();
  function candidates(target, removed, limit) {
    const key = `${target}:${limit}:${removed
      .map((card) => card.id)
      .sort()
      .join(',')}`;
    if (cache.has(key)) return cache.get(key);
    if (diagnostics.candidateCalls >= budget) {
      diagnostics.budgetExhausted = true;
      return null;
    }
    diagnostics.candidateCalls++;
    const result = makeCandidates(target, removed, limit);
    cache.set(key, result);
    return result;
  }
  // Generate each target's root candidates first: limited lookahead never invents no-solution.
  const roots = remaining.flatMap(({ index, target }) => {
    const choices = candidates(target, discard, policy.candidateLimit);
    const selected = policy.planningDepth === 0 ? choices : representatives(choices);
    return selected.map((choice) => ({ index, target, ...choice }));
  });
  if (!roots.length)
    return {
      play: { ...remaining[randomIndex(random, remaining.length)], hand: null, rank: null },
      diagnostics,
    };
  const futureWeight = 0.04;
  function futureValue(targetsLeft, removed) {
    let value = 0;
    for (const other of targetsLeft) {
      const choices = candidates(other.target, removed, 1);
      if (!choices) return null;
      value += choices[0] ? futureWeight * handStrength(choices[0].rank) : -2.5;
    }
    return value;
  }
  const baseScores = roots.map((play) => ({ ...play, utility: handStrength(play.rank) }));
  let basic = baseScores;
  if (policy.planningDepth >= 1) {
    const planned = roots.map((play) => {
      const future = futureValue(
        remaining.filter((other) => other.index !== play.index),
        [...discard, ...play.hand],
      );
      return future === null ? null : { ...play, utility: handStrength(play.rank) + future };
    });
    if (planned.every(Boolean)) basic = planned;
  }
  let evaluated = basic;
  if (policy.planningDepth > 1 && remaining.length > 1 && !diagnostics.budgetExhausted) {
    const beam = [...basic].sort((a, b) => b.utility - a.utility).slice(0, policy.beamWidth);
    const deep = [];
    for (const root of beam) {
      const left = remaining.filter((other) => other.index !== root.index);
      const removed = [...discard, ...root.hand];
      let bestFuture = -Infinity;
      for (const next of left) {
        const choices = candidates(next.target, removed, policy.candidateLimit);
        if (!choices) break;
        for (const choice of representatives(choices)) {
          const tail = futureValue(
            left.filter((other) => other.index !== next.index),
            [...removed, ...choice.hand],
          );
          if (tail === null) break;
          bestFuture = Math.max(bestFuture, futureWeight * handStrength(choice.rank) + tail);
        }
        if (diagnostics.budgetExhausted) break;
      }
      if (diagnostics.budgetExhausted) break;
      deep.push({
        ...root,
        utility:
          handStrength(root.rank) + (Number.isFinite(bestFuture) ? bestFuture : -2.5 * left.length),
      });
    }
    if (deep.length === beam.length) {
      diagnostics.deepened = true;
      evaluated = deep;
    }
  }
  const best = Math.max(...evaluated.map((play) => play.utility));
  const close = evaluated.filter((play) => best - play.utility <= policy.playTolerance + 1e-9);
  const { utility, ...play } = close[randomIndex(random, close.length)];
  return { play, diagnostics };
}

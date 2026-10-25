import { makeCandidates } from './cards.js';
import { randomIndex } from './deal.js';

// Preserve lexicographic kickers without mistaking rankHand.score for full rank.
export function handStrength(rank) {
  return rank
    ? rank.category + 1 + rank.tie.reduce((sum, value, i) => sum + value / 15 ** (i + 1), 0)
    : 0;
}

export function choosePlannedPlay(targets, usedTargets, discard, random = Math.random) {
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

import { makeCandidates } from './cards.js';
import { randomIndex } from './deal.js';
import { compareRanks, rankHand } from './rules.js';
import { handStrength } from './ai-planning.js';

// A bounded model of strong legal recommendations, not a calibrated win rate
// or an enumeration of every physical hand the player could choose.
export function estimateShowdown(hand, opponentTarget, discard, history = []) {
  const candidates = makeCandidates(opponentTarget, discard, 12);
  if (!candidates.length) return { win: 1, tie: 0, lose: 0, overlapLoss: 0, samples: 0 };
  const own = rankHand(hand);
  const ids = new Set(hand.map((card) => card.id));
  const pressure = history.filter((event) => event.actor === 'player' && event.raised > 0).length;
  const best = handStrength(candidates[0].rank);
  const model = { win: 0, tie: 0, lose: 0, overlapLoss: 0, samples: candidates.length };
  let total = 0;
  for (const candidate of candidates) {
    const weight = Math.exp(
      (handStrength(candidate.rank) - best) * (2 + Math.min(4, pressure) * 0.8),
    );
    total += weight;
    const comparison = compareRanks(own, candidate.rank);
    model[comparison > 0 ? 'win' : comparison < 0 ? 'lose' : 'tie'] += weight;
    if (comparison < 0 && candidate.hand.some((card) => ids.has(card.id)))
      model.overlapLoss += weight;
  }
  for (const key of ['win', 'tie', 'lose', 'overlapLoss']) model[key] /= total;
  return model;
}

// Expected additional AIR relative to folding now; sunk contributions remain
// in the pot. Assume a raise is called, with no speculative fold-equity bonus.
export function betValue(model, options, raise = 0) {
  const cost = options.toCall + raise;
  const pot = options.potAfterCall + 2 * raise;
  const committed = pot / 2;
  const burned = Math.min(Math.max(0, options.reserve - cost), committed);
  return model.win * pot + model.tie * committed - cost - model.overlapLoss * burned;
}

export function chooseValueBet(
  { hand, opponentTarget, discard, options, history },
  random = Math.random,
) {
  if (!options.active) return null;
  if (!hand) return { action: options.canCheck ? 'check' : 'fold' };
  const model = estimateShowdown(hand, opponentTarget, discard, history);
  const callValue = betValue(model, options);
  if (options.canFold && options.toCall > 0 && callValue < -1e-9) return { action: 'fold' };
  if (options.canRaise) {
    const sizes = [...new Set([1, Math.ceil(options.maxRaise / 2), options.maxRaise])];
    const scored = sizes.map((amount) => ({ amount, value: betValue(model, options, amount) }));
    const best = Math.max(callValue, ...scored.map((choice) => choice.value));
    const tied = scored.filter(
      (choice) => choice.value > callValue + 0.05 && Math.abs(choice.value - best) < 1e-9,
    );
    if (tied.length) {
      const { amount } = tied[randomIndex(random, tied.length)];
      if (options.canAllIn && options.allInCost === options.toCall + amount)
        return { action: 'all-in' };
      return { action: 'raise', amount };
    }
  }
  return { action: options.canCall ? 'call' : 'check' };
}

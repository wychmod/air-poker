import { makeCandidates } from './cards.js';
import { randomIndex } from './deal.js';
import { compareRanks, rankHand } from './rules.js';
import { handStrength } from './ai-planning.js';
import { summarizePublicActions } from './ai-observation.js';

// A bounded model of strong legal recommendations, not a calibrated win rate
// or an enumeration of every physical hand the player could choose.
export function estimateShowdown(hand, opponentTarget, discard, history = [], pressureScale = 0.8) {
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
      (handStrength(candidate.rank) - best) * (2 + Math.min(4, pressure) * pressureScale),
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
// in the pot. Raising assumes a call, which closes betting by rule, so no
// speculative fold equity enters. Approving the outstanding call also ends the
// round, so the raise = 0 case is the exact call-and-showdown value.
export function betValue(model, options, raise = 0) {
  const cost = options.toCall + raise;
  const pot = options.potAfterCall + 2 * raise;
  const committed = pot / 2;
  const burned = Math.min(Math.max(0, options.reserve - cost), committed);
  return model.win * pot + model.tie * committed - cost - model.overlapLoss * burned;
}

export function chooseValueBet(
  { hand, opponentTarget, discard, options, history, observations },
  random = Math.random,
  policy,
) {
  if (policy)
    return chooseDifficultyBet(
      { hand, opponentTarget, discard, options, history, observations },
      random,
      policy,
    );
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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function difficultyBetContext(input, policy) {
  let pressureScale = 0.8;
  let riskWeight = policy.riskWeight;
  if (policy.adaptive && input.observations?.length) {
    const currentTurns = new Set(
      (input.history ?? []).map((event) => event.turnId).filter(Number.isSafeInteger),
    );
    const priorObservations = input.observations.filter(
      (entry) => !currentTurns.has(entry?.turnId),
    );
    const habits = summarizePublicActions(priorObservations);
    const change = (metric) =>
      metric.opportunities < 2 ? 0 : (metric.rate - metric.prior) * metric.confidence;
    // Frequent raises carry less extra evidence of strength. No private cards
    // or uncalibrated fold-equity profit enters this bounded model.
    pressureScale = clamp(0.8 - change(habits.aggression) * 1.4, 0.35, 1.25);
    riskWeight *= clamp(
      1 + change(habits.continue) - change(habits.check) * 0.5 - change(habits.fold) * 0.25,
      0.6,
      1.5,
    );
  }
  return {
    model: estimateShowdown(
      input.hand,
      input.opponentTarget,
      input.discard,
      input.history,
      pressureScale,
    ),
    riskWeight,
  };
}

function chooseDifficultyBet(input, random, policy) {
  const { options, hand } = input;
  if (!options.active) return null;
  if (!hand)
    return options.canCheck ? { action: 'check' } : options.canFold ? { action: 'fold' } : null;
  const { model, riskWeight } = difficultyBetContext(input, policy);
  const actions = [];
  function add(action, amount = 0) {
    const cost = options.toCall + amount;
    const value = betValue(model, options, amount);
    if (cost > 0 && value < -1e-9) return;
    const risk = (riskWeight * cost ** 2) / Math.max(1, options.reserve);
    actions.push({
      action,
      amount,
      score: value - risk,
    });
  }
  if (options.canCheck) add('check');
  else if (options.canCall) add('call');
  if (options.canRaise) {
    const fractions =
      policy.id === 'beginner' ? [] : policy.id === 'hard' ? [0.25, 0.5, 0.75, 1] : [0.5, 1];
    const sizes = [
      ...new Set([1, ...fractions.map((fraction) => Math.ceil(options.maxRaise * fraction))]),
    ];
    for (const amount of sizes) if (amount <= options.maxRaise) add('raise', amount);
  }
  if (options.canFold && !options.canCheck) actions.push({ action: 'fold', amount: 0, score: 0 });
  if (!actions.length) return null;
  const best = Math.max(...actions.map((choice) => choice.score));
  const close = actions.filter((choice) => best - choice.score <= policy.betTolerance + 1e-9);
  const selected = close[randomIndex(random, close.length)];
  if (selected.action === 'raise')
    return options.canAllIn && options.allInCost === options.toCall + selected.amount
      ? { action: 'all-in' }
      : { action: 'raise', amount: selected.amount };
  return { action: selected.action };
}

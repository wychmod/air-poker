import { chooseCpuBet, chooseCpuPlay } from './ai.js';

import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_IDS,
  difficultyPolicy,
  isDifficultyId,
} from './difficulty.js';

export const LEGACY_OPPONENT_IDS = Object.freeze(['analyst', 'abyss', 'mirror']);
export const OPPONENT_IDS = Object.freeze([...DIFFICULTY_IDS, ...LEGACY_OPPONENT_IDS]);
export const DEFAULT_OPPONENT = DEFAULT_DIFFICULTY;

export const isOpponentId = (value) => OPPONENT_IDS.includes(value);

const legalFallback = (options) =>
  options.canCheck
    ? { action: 'check' }
    : options.canCall
      ? { action: 'call' }
      : options.canFold
        ? { action: 'fold' }
        : null;

const raise = (options, fraction, random) => {
  if (!options.canRaise) return legalFallback(options);
  const amount = Math.max(1, Math.min(options.maxRaise, Math.ceil(options.maxRaise * fraction)));
  if (options.canAllIn && options.allInCost === options.toCall + amount && random() < 0.18)
    return { action: 'all-in' };
  return { action: 'raise', amount };
};

// The analyst is the original value model. The other two personas only alter
// legal betting pressure; they receive the same public information as the base AI.
function abyssBet(input, random) {
  const options = input.options;
  const base = chooseCpuBet(input, random);
  if (!base || !options?.active) return base;
  if (
    base.action === 'fold' &&
    options.canCall &&
    options.toCall <= Math.max(1, Math.floor(options.reserve * 0.25)) &&
    random() < 0.62
  )
    return { action: 'call' };
  if (
    base.action !== 'fold' &&
    options.canRaise &&
    random() < (base.action === 'call' ? 0.42 : 0.3)
  )
    return raise(options, random() < 0.3 ? 1 : 0.5, random);
  return base;
}

function mirrorBet(input, random) {
  const options = input.options;
  const base = chooseCpuBet(input, random);
  if (!base || !options?.active) return base;
  const lastPlayer = [...(input.history ?? [])].reverse().find((event) => event.actor === 'player');
  if (!lastPlayer) return base;
  const mirroredPressure = lastPlayer.action === 'raise' || lastPlayer.action === 'all-in';
  if (options.canRaise && mirroredPressure && random() < 0.55)
    return raise(options, random() < 0.45 ? 0.5 : 1, random);
  if (options.canRaise && lastPlayer.action === 'check' && random() < 0.34)
    return raise(options, 0.5, random);
  if (
    base.action === 'fold' &&
    options.canCall &&
    options.toCall <= Math.max(1, Math.floor(options.reserve * 0.3)) &&
    random() < 0.48
  )
    return { action: 'call' };
  return base;
}

const bettingByOpponent = Object.freeze({
  analyst: chooseCpuBet,
  abyss: abyssBet,
  mirror: mirrorBet,
});

export function createOpponent(id = DEFAULT_OPPONENT) {
  const opponentId = isOpponentId(id) ? id : DEFAULT_OPPONENT;
  if (isDifficultyId(opponentId)) {
    const policy = difficultyPolicy(opponentId);
    return {
      id: opponentId,
      choosePlay: (targets, usedTargets, discard, random) =>
        chooseCpuPlay(targets, usedTargets, discard, random, policy),
      chooseBet: (input, random) => chooseCpuBet(input, random, policy),
    };
  }
  return {
    id: opponentId,
    choosePlay: chooseCpuPlay,
    chooseBet: bettingByOpponent[opponentId],
  };
}

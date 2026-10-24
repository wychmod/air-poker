import { TARGET_SETS } from './data.js';
import { makeCandidates, makeHand } from './cards.js';
import { compareHands, effectiveHand, rankHand, settleBets } from './rules.js';

export const STARTING_AIR = 25;
export const BET_SECONDS = 30;

function initialState() {
  return {
    phase: 'lower',
    round: 1,
    maxRounds: TARGET_SETS.length,
    playerAir: STARTING_AIR,
    aiAir: STARTING_AIR,
    pot: 0,
    deck: 52,
    discard: [],
    targets: [...TARGET_SETS[0]],
    usedTargets: [],
    playerTarget: null,
    aiTarget: null,
    candidates: [],
    selectedCandidate: 0,
    playerHand: null,
    aiHand: null,
    playerBet: 0,
    aiBet: 0,
    lastResult: null,
    feed: [],
    traces: [],
  };
}

export function createGame() {
  let state;
  let sequence;

  function log(key, args = {}, strong = '') {
    state.feed.unshift({
      time: `R${state.round} · ${String(12 + sequence++ * 3).padStart(2, '0')}`,
      key,
      args,
      strong,
    });
    state.feed = state.feed.slice(0, 7);
  }

  function reset() {
    state = initialState();
    sequence = 0;
    log('readyLog', {}, 'LINK');
    log('reserveLog', {}, 'READY');
  }

  function chooseTarget(index) {
    if (
      state.phase !== 'lower' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= state.targets.length ||
      state.usedTargets.includes(index)
    )
      return false;
    state.playerTarget = state.targets[index];
    state.aiTarget = state.targets[(index + 2) % state.targets.length];
    state.usedTargets.push(index);
    state.candidates = makeCandidates(state.playerTarget, state.discard);
    state.selectedCandidate = 0;
    // CPU hand is chosen privately when its target is revealed.
    state.aiHand = makeHand(state.aiTarget, state.round % 2);
    log('lowerLog', { n: state.playerTarget }, 'LOWER');
    log('cpuLock', {}, 'CPU');
    state.phase = 'upper';
    return true;
  }

  function selectCandidate(index) {
    if (
      state.phase !== 'upper' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= state.candidates.length
    )
      return false;
    state.selectedCandidate = index;
    return true;
  }

  function confirmHand() {
    if (state.phase !== 'upper') return false;
    const candidate = state.candidates[state.selectedCandidate];
    if (!candidate) return false;
    state.playerHand = candidate.hand;
    // The prototype has no side pots: both sides commit a matchable amount.
    const entry = Math.min(state.round, state.playerAir, state.aiAir);
    state.playerBet = entry;
    state.aiBet = entry;
    state.pot = entry * 2;
    state.playerAir -= entry;
    state.aiAir -= entry;
    log('handLog', { nameKey: candidate.rank.key }, 'UPPER');
    log('entryLog', { n: state.pot }, 'POT');
    state.phase = 'bet';
    return true;
  }

  function resolveRound(folded) {
    const player = effectiveHand(state.playerHand, state.discard);
    const ai = effectiveHand(state.aiHand, state.discard);
    const comparison = compareHands(player, ai);
    const winner = folded ? 'ai' : comparison > 0 ? 'player' : comparison < 0 ? 'ai' : 'tie';
    const overlap = player.filter((card) => ai.some((other) => other.id === card.id));
    const calamity = overlap.length > 0;
    const settled = settleBets({ ...state, winner, calamity });
    state.playerAir = settled.playerAir;
    state.aiAir = settled.aiAir;
    state.lastResult = {
      winner,
      calamity,
      overlap,
      folded,
      playerRank: rankHand(player),
      aiRank: rankHand(ai),
      burned: settled.burned,
      pot: state.pot,
      usedCardIds: state.discard.map((card) => card.id),
    };
    state.discard = [
      ...new Map([...state.discard, ...player, ...ai].map((card) => [card.id, card])).values(),
    ];
    state.deck = 52 - state.discard.length;
    state.pot = 0;
    state.traces[state.round - 1] = { winner, calamity };
    log(
      winner === 'player' ? 'winLog' : winner === 'ai' ? 'loseLog' : 'tieLog',
      {},
      winner.toUpperCase(),
    );
    if (calamity && winner !== 'tie') log('calamityLog', { n: overlap.length }, 'CALAMITY');
    state.phase = 'showdown';
  }

  function resolveBet(action, amount) {
    if (state.phase !== 'bet' || !['check', 'call', 'raise', 'fold', 'all-in'].includes(action))
      return false;
    if (action === 'raise' && (!Number.isInteger(amount) || amount < 1 || amount > 4)) return false;
    if (action === 'fold') {
      log('foldLog', {}, 'FOLD');
      resolveRound(true);
      return true;
    }
    const limit = Math.min(state.playerAir, state.aiAir);
    const extra = action === 'all-in' ? limit : action === 'raise' ? Math.min(amount, limit) : 0;
    if ((action === 'all-in' || action === 'raise') && extra <= 0) return false;
    state.playerAir -= extra;
    state.playerBet += extra;
    state.aiAir -= extra;
    state.aiBet += extra;
    state.pot += extra * 2;
    if (action === 'all-in') log('allinLog', { n: extra }, 'BET');
    else if (action === 'raise') log('raiseLog', { n: extra }, 'BET');
    else log(action === 'call' ? 'callLog' : 'checkLog', {}, 'BET');
    log('cpuCall', {}, 'CPU');
    resolveRound(false);
    return true;
  }

  function advanceRound() {
    if (state.phase !== 'showdown') return false;
    if (state.playerAir <= 0 || state.aiAir <= 0 || state.round >= state.maxRounds) {
      state.phase = 'summary';
      return true;
    }
    state.round += 1;
    state.targets = [...TARGET_SETS[state.round - 1]];
    state.usedTargets = [];
    state.playerTarget = null;
    state.aiTarget = null;
    state.playerHand = null;
    state.aiHand = null;
    state.playerBet = 0;
    state.aiBet = 0;
    state.candidates = [];
    state.selectedCandidate = 0;
    state.lastResult = null;
    state.playerAir = Math.max(0, state.playerAir - 1);
    state.aiAir = Math.max(0, state.aiAir - 1);
    log('roundLog', { n: state.round }, 'ROUND');
    state.phase = state.playerAir <= 0 || state.aiAir <= 0 ? 'summary' : 'lower';
    return true;
  }

  function dispatch(action) {
    if (!action || typeof action !== 'object') return false;
    switch (action.type) {
      case 'choose-target':
        return chooseTarget(action.index);
      case 'select-candidate':
        return selectCandidate(action.index);
      case 'recommend-hand':
        return selectCandidate(0);
      case 'confirm-hand':
        return confirmHand();
      case 'bet':
        return resolveBet(action.action, action.amount);
      case 'advance-round':
        return advanceRound();
      default:
        return false;
    }
  }

  reset();
  return { getState: () => structuredClone(state), dispatch, reset };
}

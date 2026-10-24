import { makeCandidates } from './cards.js';
import { dealTargets, randomIndex } from './deal.js';
import { chooseCpuPlay, chooseCpuBet } from './ai.js';
import { applyBetAction, getBetOptions, otherPlayer } from './betting.js';
import { compareHands, rankHand, settleBets } from './rules.js';

export const STARTING_AIR = 25;
export const BET_SECONDS = 30;

function initialState(targets) {
  return {
    phase: 'lower',
    round: 1,
    maxRounds: 5,
    completedRounds: 0,
    endReason: null,
    breathSpent: 0,
    playerAir: STARTING_AIR,
    aiAir: STARTING_AIR,
    pot: 0,
    deck: 52,
    discard: [],
    targets,
    targetPlayable: [],
    aiRemaining: 5,
    aiPlayedTargets: [],
    usedTargets: [],
    playerTarget: null,
    aiTarget: null,
    candidates: [],
    selectedCandidate: 0,
    playerHand: null,
    aiHand: null,
    firstBettor: null,
    betting: null,
    playerBet: 0,
    aiBet: 0,
    lastResult: null,
    feed: [],
    traces: [],
  };
}

export function createGame({ random = Math.random } = {}) {
  let state;
  let sequence;
  let betSerial = 0;
  let aiTargets;
  let aiUsed;
  let cpuPlay;
  let candidatesByTarget;

  function log(key, args = {}, strong = '') {
    state.feed.unshift({
      time: `R${state.round} · ${String(12 + sequence++ * 3).padStart(2, '0')}`,
      key,
      args,
      strong,
    });
    state.feed = state.feed.slice(0, 7);
  }

  function finish(reason) {
    state.phase = 'summary';
    state.endReason = reason;
  }

  function prepareRound() {
    candidatesByTarget = state.targets.map((target, index) =>
      state.usedTargets.includes(index) ? [] : makeCandidates(target, state.discard),
    );
    state.targetPlayable = candidatesByTarget.map((candidates) => candidates.length > 0);
    cpuPlay = chooseCpuPlay(aiTargets, aiUsed, state.discard, random);
    if (!cpuPlay || !state.targetPlayable.some(Boolean)) {
      finish('no-legal-target');
      return false;
    }
    return true;
  }

  function reset() {
    const deal = dealTargets(random);
    state = initialState(deal.player.map((group) => group.target));
    aiTargets = deal.ai.map((group) => group.target);
    aiUsed = [];
    sequence = 0;
    log('readyLog', {}, 'LINK');
    log('reserveLog', {}, 'READY');
    prepareRound();
  }

  function chooseTarget(index) {
    if (
      state.phase !== 'lower' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= state.targets.length ||
      !state.targetPlayable[index]
    )
      return false;
    state.playerTarget = state.targets[index];
    state.aiTarget = cpuPlay.target;
    state.usedTargets.push(index);
    state.targetPlayable[index] = false;
    aiUsed.push(cpuPlay.index);
    state.aiRemaining = aiTargets.length - aiUsed.length;
    state.aiPlayedTargets.push(cpuPlay.target);
    state.candidates = candidatesByTarget[index];
    state.selectedCandidate = 0;
    if (state.round === 1) {
      state.firstBettor =
        state.playerTarget < state.aiTarget
          ? 'player'
          : state.playerTarget > state.aiTarget
            ? 'ai'
            : randomIndex(random, 2)
              ? 'ai'
              : 'player';
    }
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
    state.betting = {
      first: state.firstBettor,
      turn: state.firstBettor,
      turnId: ++betSerial,
      checks: 0,
      history: [],
    };
    log('firstBetLog', { nameKey: state.firstBettor === 'player' ? 'you' : 'cpu' }, 'BET');
    if (Math.min(state.playerAir, state.aiAir) === 0) resolveRound();
    return true;
  }

  function resolveRound(foldedBy = null) {
    const folded = foldedBy !== null;
    state.betting.turn = null;
    const player = state.playerHand;
    const ai = cpuPlay.hand;
    state.aiHand = ai;
    const comparison = compareHands(player, ai);
    const winner = folded
      ? otherPlayer(foldedBy)
      : comparison > 0
        ? 'player'
        : comparison < 0
          ? 'ai'
          : 'tie';
    const overlap = player.filter((card) => ai.some((other) => other.id === card.id));
    const calamity = !folded && overlap.length > 0;
    const settled = settleBets({ ...state, winner, calamity });
    state.playerAir = settled.playerAir;
    state.aiAir = settled.aiAir;
    state.lastResult = {
      winner,
      calamity,
      overlap,
      folded,
      foldedBy,
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
    state.completedRounds += 1;
    log(
      winner === 'player' ? 'winLog' : winner === 'ai' ? 'loseLog' : 'tieLog',
      {},
      winner.toUpperCase(),
    );
    if (calamity && winner !== 'tie') log('calamityLog', { n: overlap.length }, 'CALAMITY');
    state.phase = 'showdown';
  }

  function isBetTurn(actor, turnId) {
    return (
      state.phase === 'bet' &&
      state.betting.turn === actor &&
      Number.isInteger(turnId) &&
      turnId === state.betting.turnId
    );
  }

  function resolveBet(actor, action, amount, turnId, timedOut = false) {
    if (!isBetTurn(actor, turnId)) return false;
    const result = applyBetAction(state, actor, action, amount);
    if (!result) return false;
    state = result.state;
    betSerial = state.betting.turnId;
    const cpu = actor === 'ai';
    const event = result.event;
    if (timedOut) log(action === 'fold' ? 'timeoutFoldLog' : 'timeoutCheckLog', {}, 'TIME');
    const key =
      action === 'check'
        ? cpu
          ? 'cpuCheck'
          : 'checkLog'
        : action === 'call'
          ? cpu
            ? 'cpuCall'
            : 'callLog'
          : action === 'raise'
            ? cpu
              ? 'cpuRaise'
              : 'raiseLog'
            : action === 'all-in'
              ? cpu
                ? 'cpuAllin'
                : 'allinLog'
              : cpu
                ? 'cpuFold'
                : 'foldLog';
    log(
      key,
      { n: action === 'raise' ? event.raised : event.paid, call: event.called },
      cpu ? 'CPU' : 'BET',
    );
    if (result.outcome !== 'continue') resolveRound(result.foldedBy);
    return true;
  }

  function actCpu(turnId) {
    if (!isBetTurn('ai', turnId)) return false;
    const decision = chooseCpuBet(
      {
        hand: cpuPlay.hand,
        opponentTarget: state.playerTarget,
        discard: state.discard,
        options: getBetOptions(state, 'ai'),
        history: state.betting.history,
      },
      random,
    );
    return resolveBet('ai', decision.action, decision.amount, turnId);
  }

  function advanceRound() {
    if (state.phase !== 'showdown') return false;
    if (state.playerAir <= 0 || state.aiAir <= 0) {
      finish('air-exhausted');
      return true;
    }
    if (state.completedRounds >= state.maxRounds) {
      finish('round-limit');
      return true;
    }
    if (!prepareRound()) return true;
    const playerCost = Math.min(1, state.playerAir);
    const aiCost = Math.min(1, state.aiAir);
    state.playerAir -= playerCost;
    state.aiAir -= aiCost;
    state.breathSpent += playerCost + aiCost;
    if (state.playerAir <= 0 || state.aiAir <= 0) {
      finish('air-exhausted');
      return true;
    }
    state.round = state.completedRounds + 1;
    state.firstBettor = otherPlayer(state.firstBettor);
    state.betting = null;
    state.playerTarget = null;
    state.aiTarget = null;
    state.playerHand = null;
    state.aiHand = null;
    state.playerBet = 0;
    state.aiBet = 0;
    state.candidates = [];
    state.selectedCandidate = 0;
    state.lastResult = null;
    log('roundLog', { n: state.round }, 'ROUND');
    state.phase = 'lower';
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
        return resolveBet('player', action.action, action.amount, action.turnId);
      case 'cpu-bet':
        return actCpu(action.turnId);
      case 'bet-timeout':
        return resolveBet(
          'player',
          getBetOptions(state, 'player').toCall > 0 ? 'fold' : 'check',
          undefined,
          action.turnId,
          true,
        );
      case 'advance-round':
        return advanceRound();
      default:
        return false;
    }
  }

  reset();
  return {
    getState: () => structuredClone({ ...state, legalBets: getBetOptions(state, 'player') }),
    dispatch,
    reset,
  };
}

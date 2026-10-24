import { judgeHand, makeCandidates } from './cards.js';
import { dealTargets, randomIndex } from './deal.js';
import { chooseCpuPlay, chooseCpuBet } from './ai.js';
import { applyBetAction, getBetOptions, otherPlayer } from './betting.js';
import { compareHands, rankHand, settleBets } from './rules.js';
import {
  advanceBreathing,
  startBreathing,
  timeToDrowning,
  CANISTER_MS,
  HYPOXIA_MS,
} from './breathing.js';
import { createRecorder } from './records.js';

export const STARTING_AIR = 25;
export const BET_SECONDS = 30;
export const UPPER_SECONDS = 60;

function initialState(targets) {
  return {
    phase: 'lower',
    round: 1,
    maxRounds: 5,
    completedRounds: 0,
    endReason: null,
    winner: null,
    enduranceReason: null,
    upper: null,
    breathSpent: 0,
    playerAir: STARTING_AIR,
    aiAir: STARTING_AIR,
    pot: 0,
    deck: 52,
    discard: [],
    targets,
    targetPlayable: [],
    targetSolvable: [],
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

export function createGame({ random = Math.random, recordId = 'local' } = {}) {
  let state;
  let recorder;
  let sequence;
  let betSerial = 0;
  let upperSerial = 0;
  let sessionSerial = 0;
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

  function finish(reason, winner) {
    state.phase = 'summary';
    state.endReason = reason;
    state.winner = winner;
    recorder.finish(state);
  }

  function refundPot(reason = 'termination-refund') {
    recorder.transfer(state, reason, 'pot', 'player', state.playerBet);
    recorder.transfer(state, reason, 'pot', 'ai', state.aiBet);
    state.playerAir += state.playerBet;
    state.aiAir += state.aiBet;
    state.playerBet = 0;
    state.aiBet = 0;
    state.pot = 0;
  }

  function breathe(duration) {
    const before = { respiration: state.respiration };
    const { drowned, ...next } = advanceBreathing(state, duration);
    Object.assign(state, next);
    recorder.breathing(before, state);
    if (drowned.length) {
      if (state.pot) refundPot();
      if (state.betting) state.betting.turn = null;
      finish('breath-exhausted', drowned.length === 2 ? 'tie' : otherPlayer(drowned[0]));
      log('breathEndLog', {}, 'AIR');
      return;
    }
    if (
      (state.phase === 'lower' || state.phase === 'upper') &&
      state.pot === 0 &&
      Math.min(state.playerAir, state.aiAir) === 0
    ) {
      enterEndurance('no-betting-air');
      return;
    }
    if (state.phase === 'bet') {
      // Breathing can reduce what the other side can still match. Return only
      // unmatched excess before resolving; opened breathing AIR is never bet.
      const limit = Math.min(state.playerBet + state.playerAir, state.aiBet + state.aiAir);
      let refunded = 0;
      for (const actor of ['player', 'ai']) {
        const excess = Math.max(0, state[`${actor}Bet`] - limit);
        recorder.transfer(state, 'unmatched-refund', 'pot', actor, excess);
        state[`${actor}Bet`] -= excess;
        state[`${actor}Air`] += excess;
        state.pot -= excess;
        refunded += excess;
      }
      if (refunded) {
        log('matchRefundLog', { n: refunded }, 'AIR');
        breathe(0);
        return;
      }
      if (state.playerBet === state.aiBet && Math.min(state.playerAir, state.aiAir) === 0)
        resolveRound();
    }
  }

  function enterEndurance(reason) {
    if (reason === 'no-betting-air') recorder.closeRound(state, 'interrupted', reason);
    state.phase = 'endurance';
    state.enduranceReason = reason;
    state.upper = null;
    if (state.betting) state.betting.turn = null;
    recorder.event(state, 'endurance-started', { reason });
    log('enduranceLog', {}, 'AIR');
  }

  function elapse(action) {
    if (
      state.phase === 'summary' ||
      action.sessionId !== state.sessionId ||
      !Number.isSafeInteger(action.elapsedMs) ||
      action.elapsedMs <= state.respiration.elapsedMs
    )
      return false;
    while (state.phase !== 'summary' && state.respiration.elapsedMs < action.elapsedMs) {
      const phase = state.phase;
      const id = phase === 'upper' ? state.upper.attemptId : state.betting?.turnId;
      const deadline =
        phase === 'upper'
          ? state.upper.deadlineMs
          : phase === 'bet'
            ? state.betting.deadlineMs
            : Infinity;
      const supplyBoundary = Math.min(
        ...['player', 'ai'].map((actor) => {
          const supply = state.respiration[actor];
          return supply.remainingMs > 0 ? supply.remainingMs : HYPOXIA_MS - supply.shortageMs;
        }),
      );
      const delta = Math.min(
        action.elapsedMs - state.respiration.elapsedMs,
        Math.max(0, deadline - state.respiration.elapsedMs),
        supplyBoundary,
      );
      breathe(delta);
      if (state.phase === 'summary') break;
      if (phase === state.phase && state.respiration.elapsedMs >= deadline) {
        if (phase === 'upper' && state.upper.attemptId === id) confirmHand(id, 'timeout');
        else if (phase === 'bet' && state.betting.turnId === id) {
          if (state.betting.turn === 'ai') actCpu(id);
          else
            resolveBet(
              'player',
              getBetOptions(state, 'player').toCall > 0 ? 'fold' : 'check',
              undefined,
              id,
              true,
            );
        }
      }
    }
    return true;
  }

  function prepareRound() {
    candidatesByTarget = state.targets.map((target, index) =>
      state.usedTargets.includes(index) ? [] : makeCandidates(target, state.discard),
    );
    state.targetSolvable = candidatesByTarget.map((candidates) => candidates.length > 0);
    state.targetPlayable = state.targets.map((_, index) => !state.usedTargets.includes(index));
    cpuPlay = chooseCpuPlay(aiTargets, aiUsed, state.discard, random);
    if (!cpuPlay || !state.targetPlayable.some(Boolean)) {
      enterEndurance('round-limit');
      return false;
    }
    return true;
  }

  function reset() {
    const deal = dealTargets(random);
    state = initialState(deal.player.map((group) => group.target));
    state.sessionId = ++sessionSerial;
    const { drowned, ...breathing } = startBreathing(STARTING_AIR, STARTING_AIR);
    Object.assign(state, breathing);
    recorder = createRecorder({
      matchId: `${recordId}-${state.sessionId}`,
      initialAir: STARTING_AIR,
      rules: {
        canisterMs: CANISTER_MS,
        hypoxiaMs: HYPOXIA_MS,
        upperSeconds: UPPER_SECONDS,
        betSeconds: BET_SECONDS,
        maxRounds: 5,
      },
    });
    recorder.event(state, 'match-started');
    recorder.breathing(
      {
        respiration: {
          elapsedMs: 0,
          player: { opened: 0, remainingMs: 0 },
          ai: { opened: 0, remainingMs: 0 },
        },
      },
      state,
    );
    aiTargets = deal.ai.map((group) => group.target);
    aiUsed = [];
    sequence = 0;
    log('readyLog', {}, 'LINK');
    log('reserveLog', {}, 'READY');
    prepareRound();
    recorder.openRound(state);
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
    state.upper = {
      attemptId: ++upperSerial,
      attempt: 1,
      retry: false,
      playerReason: null,
      deadlineMs: state.respiration.elapsedMs + UPPER_SECONDS * 1000,
    };
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
    recorder.chooseTargets(state, index, cpuPlay.index);
    recorder.startAttempt(state, cpuPlay.hand);
    return true;
  }

  function selectCandidate(index, via = 'select-candidate') {
    if (
      state.phase !== 'upper' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= state.candidates.length
    )
      return false;
    state.selectedCandidate = index;
    recorder.event(state, 'candidate-selected', {
      index,
      via,
      cardIds: state.candidates[index].hand.map((card) => card.id),
    });
    return true;
  }

  function confirmHand(attemptId, failed = false, submittedHand) {
    if (state.phase !== 'upper' || attemptId !== state.upper.attemptId) return false;
    const hand = failed ? null : (submittedHand ?? state.candidates[state.selectedCandidate]?.hand);
    const judged = judgeHand(hand, state.playerTarget, state.discard);
    state.playerHand = judged.valid ? judged.hand : null;
    state.upper.playerReason = judged.valid ? null : failed || judged.reason;
    recorder.lockAttempt(state);
    if (state.upper.retry) {
      resolveRound();
      return true;
    }
    // The prototype has no side pots: both sides commit a matchable amount.
    const entry = Math.min(state.round, state.playerAir, state.aiAir);
    state.playerBet = entry;
    state.aiBet = entry;
    state.pot = entry * 2;
    state.playerAir -= entry;
    state.aiAir -= entry;
    recorder.transfer(state, 'ante', 'player', 'pot', entry);
    recorder.transfer(state, 'ante', 'ai', 'pot', entry);
    log(
      judged.valid ? 'handLog' : failed === 'timeout' ? 'upperTimeoutLog' : 'handFailedLog',
      { nameKey: judged.valid ? rankHand(hand).key : 'upperFailed' },
      'UPPER',
    );
    log('entryLog', { n: state.pot }, 'POT');
    state.phase = 'bet';
    state.betting = {
      first: state.firstBettor,
      turn: state.firstBettor,
      turnId: ++betSerial,
      checks: 0,
      history: [],
      deadlineMs:
        state.respiration.elapsedMs + (state.firstBettor === 'player' ? BET_SECONDS * 1000 : 600),
    };
    log('firstBetLog', { nameKey: state.firstBettor === 'player' ? 'you' : 'cpu' }, 'BET');
    if (Math.min(state.playerAir, state.aiAir) === 0) resolveRound();
    return true;
  }

  function resolveRound(foldedBy = null) {
    const folded = foldedBy !== null;
    state.betting.turn = null;
    const player = state.playerHand;
    const aiJudged = judgeHand(cpuPlay.hand, state.aiTarget, state.discard);
    const ai = aiJudged.valid ? aiJudged.hand : null;
    state.aiHand = ai;
    recorder.revealAttempt(state);
    if (!folded && !player && !ai) {
      recorder.event(state, 'both-hands-failed', { attemptId: state.upper.attemptId });
      log('bothFailedLog', {}, 'UPPER');
      if (
        !makeCandidates(state.playerTarget, state.discard).length &&
        !makeCandidates(state.aiTarget, state.discard).length
      ) {
        refundPot('deadlock-refund');
        recorder.closeRound(state, 'void', 'upper-deadlock');
        enterEndurance('upper-deadlock');
        return;
      }
      state.upper = {
        attemptId: ++upperSerial,
        attempt: state.upper.attempt + 1,
        retry: true,
        playerReason: null,
        deadlineMs: state.respiration.elapsedMs + UPPER_SECONDS * 1000,
      };
      state.playerHand = null;
      state.aiHand = null;
      state.candidates = makeCandidates(state.playerTarget, state.discard);
      const cpuCandidates = makeCandidates(state.aiTarget, state.discard);
      cpuPlay = { ...cpuPlay, hand: cpuCandidates[0]?.hand ?? null };
      state.selectedCandidate = 0;
      state.phase = 'upper';
      recorder.startAttempt(state, cpuPlay.hand);
      return;
    }
    const comparison = player && ai ? compareHands(player, ai) : player ? 1 : -1;
    const winner = folded
      ? otherPlayer(foldedBy)
      : comparison > 0
        ? 'player'
        : comparison < 0
          ? 'ai'
          : 'tie';
    const overlap =
      player && ai ? player.filter((card) => ai.some((other) => other.id === card.id)) : [];
    const calamity = !folded && overlap.length > 0;
    const settled = settleBets({ ...state, winner, calamity });
    const received = {
      player: winner === 'tie' ? state.playerBet : winner === 'player' ? state.pot : 0,
      ai: winner === 'tie' ? state.aiBet : winner === 'ai' ? state.pot : 0,
    };
    for (const actor of ['player', 'ai'])
      recorder.transfer(
        state,
        winner === 'tie' ? 'tie-refund' : 'payout',
        'pot',
        actor,
        received[actor],
      );
    if (settled.burned)
      recorder.transfer(state, 'calamity', otherPlayer(winner), 'burned', settled.burned);
    state.playerAir = settled.playerAir;
    state.aiAir = settled.aiAir;
    state.lastResult = {
      winner,
      calamity,
      overlap,
      folded,
      foldedBy,
      upperFailed: { player: !player, ai: !ai },
      playerRank: player ? rankHand(player) : null,
      aiRank: ai ? rankHand(ai) : null,
      burned: settled.burned,
      pot: state.pot,
      usedCardIds: state.discard.map((card) => card.id),
    };
    state.discard = [
      ...new Map(
        [...state.discard, ...(player ?? []), ...(ai ?? [])].map((card) => [card.id, card]),
      ).values(),
    ];
    state.deck = 52 - state.discard.length;
    state.pot = 0;
    state.traces[state.round - 1] = { winner, calamity };
    state.completedRounds += 1;
    recorder.settle(state, {
      ...state.lastResult,
      reason: folded ? 'fold' : !player || !ai ? 'hand-failure' : winner === 'tie' ? 'tie' : 'rank',
      committed: { player: state.playerBet, ai: state.aiBet },
      received,
      comparison: player && ai ? Math.sign(compareHands(player, ai)) : null,
      discardedCardIds: state.discard.map((card) => card.id),
    });
    if (!folded && (!player || !ai))
      log('upperLossLog', { nameKey: player ? 'cpu' : 'you' }, 'UPPER');
    log(
      winner === 'player' ? 'winLog' : winner === 'ai' ? 'loseLog' : 'tieLog',
      {},
      winner.toUpperCase(),
    );
    if (calamity && winner !== 'tie') log('calamityLog', { n: overlap.length }, 'CALAMITY');
    state.phase = 'showdown';
    breathe(0);
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
    state.betting.deadlineMs =
      state.respiration.elapsedMs + (state.betting.turn === 'ai' ? 600 : BET_SECONDS * 1000);
    const cpu = actor === 'ai';
    const event = result.event;
    recorder.bet(state, event, timedOut);
    recorder.transfer(state, 'bet', actor, 'pot', event.paid, undefined, { turnId });
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
      enterEndurance('no-betting-air');
      return true;
    }
    if (state.completedRounds >= state.maxRounds) {
      enterEndurance('round-limit');
      return true;
    }
    if (!prepareRound()) return true;
    state.round = state.completedRounds + 1;
    state.firstBettor = otherPlayer(state.firstBettor);
    state.betting = null;
    state.upper = null;
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
    recorder.openRound(state);
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
        return selectCandidate(0, 'recommend-hand');
      case 'confirm-hand':
        return confirmHand(action.attemptId);
      case 'submit-hand':
        if (!Array.isArray(action.hand)) return false;
        return confirmHand(action.attemptId, false, action.hand);
      case 'fail-hand':
        return confirmHand(action.attemptId, 'forfeited');
      case 'upper-timeout':
        return confirmHand(action.attemptId, 'timeout');
      case 'elapse':
        return elapse(action);
      case 'fast-forward':
        if (state.phase !== 'endurance' || action.sessionId !== state.sessionId) return false;
        breathe(
          Math.min(
            timeToDrowning(state.playerAir, state.respiration.player),
            timeToDrowning(state.aiAir, state.respiration.ai),
          ),
        );
        return true;
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
    getState: () =>
      structuredClone({
        ...state,
        legalBets: getBetOptions(state, 'player'),
        accounting: recorder.summary(),
      }),
    getRecord: () => recorder.snapshot(state),
    dispatch,
    reset,
  };
}

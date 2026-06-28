import { normalizeError } from '../domain/errors';
import type { GameAction } from '../domain/game/game-actions';
import { createIdleState, gameReducer } from '../domain/game/game-reducer';
import type { GameState } from '../domain/game/game-state';
import { logDebugEvent } from './debug-log';
import { createRuntimeSeed } from './rng';
import { saveLastResult } from './settings';
import type { LastResultSummary, SaveResult, Settings } from './settings';

export type NewGameSessionInput = {
  settings: Settings;
  seed?: string;
  lastResult?: LastResultSummary | null;
};

export type GameSession = {
  readonly seed: string;
  readonly lastResult: LastResultSummary | null;
  readonly dispatch: (action: GameAction) => GameState;
  state: GameState;
};

const persistedGameOverStates = new WeakMap<GameState, LastResultSummary>();

function withUnexpectedError(state: GameState, error: unknown): GameState {
  const payload = normalizeError(error);

  return {
    ...state,
    lastError: {
      ...payload,
      phase: state.phase,
    },
  };
}

export function dispatchGameAction(state: GameState, action: GameAction): GameState {
  try {
    const next = gameReducer(state, action);

    logDebugEvent('game-session:dispatch', {
      action: action.type,
      fromPhase: state.phase,
      toPhase: next.phase,
      seed: next.seed,
      code: next.lastError?.code,
    });

    return next;
  } catch (error) {
    const next = withUnexpectedError(state, error);

    logDebugEvent(
      'game-session:dispatch',
      {
        action: action.type,
        fromPhase: state.phase,
        toPhase: next.phase,
        seed: next.seed,
        code: next.lastError?.code,
      },
      { level: 'error' },
    );

    return next;
  }
}

export function createNewGameSession(input: NewGameSessionInput): GameSession {
  const seed = input.seed ?? createRuntimeSeed();
  const session: GameSession = {
    seed,
    lastResult: input.lastResult ?? null,
    state: createIdleState(input.settings),
    dispatch(action) {
      session.state = dispatchGameAction(session.state, action);
      return session.state;
    },
  };

  logDebugEvent('game-session:create', {
    phase: session.state.phase,
    seed,
    hasLastResult: session.lastResult !== null,
  });

  return session;
}

export function persistResultIfGameOver(state: GameState): SaveResult | null {
  if (state.phase !== 'gameOver') {
    return null;
  }

  const existing = persistedGameOverStates.get(state);
  if (existing !== undefined) {
    logDebugEvent('last-result:persist', {
      result: 'skipped',
      reason: 'already-saved',
      seed: existing.seed,
      outcome: existing.outcome,
      endReason: existing.endReason,
    });

    return { ok: true };
  }

  const summary = state.currentRound.finalResult;
  const result = saveLastResult(summary);

  if (result.ok) {
    persistedGameOverStates.set(state, summary);
  }

  logDebugEvent('last-result:persist', {
    result: result.ok ? 'saved' : 'failed',
    seed: summary.seed,
    outcome: summary.outcome,
    endReason: summary.endReason,
    roundsPlayed: summary.roundsPlayed,
    code: result.ok ? undefined : result.code,
  });

  return result;
}

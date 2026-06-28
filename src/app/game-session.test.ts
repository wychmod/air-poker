import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createIdleState } from '../domain/game/game-reducer';
import type { GameState } from '../domain/game/game-state';
import { clearDebugLogs, getDebugLogs } from './debug-log';
import {
  createNewGameSession,
  dispatchGameAction,
  persistResultIfGameOver,
} from './game-session';
import { DEFAULT_SETTINGS, LAST_RESULT_STORAGE_KEY, loadLastResult } from './settings';
import type { LastResultSummary, Settings } from './settings';

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const customSettings: Settings = {
  version: 1,
  soundEnabled: false,
  theme: 'dark',
  reduceMotion: true,
  showAIDebug: true,
};

const lastResult: LastResultSummary = {
  version: 1,
  seed: 'seed-001',
  outcome: 'playerWin',
  endReason: 'fiveRounds',
  finalPlayerAir: 12,
  finalAiAir: 0,
  roundsPlayed: 5,
  playerPool: 8,
  aiPool: 2,
  calamityCount: 1,
  playerAllInCount: 1,
  aiAllInCount: 0,
  timestamp: '2026-06-21T00:00:00.000Z',
};

function createGameOverState(summary: LastResultSummary = lastResult): GameState {
  const idle = createIdleState(DEFAULT_SETTINGS);

  return {
    ...idle,
    seed: summary.seed,
    phase: 'gameOver',
    roundNumber: summary.roundsPlayed,
    playerAir: summary.finalPlayerAir,
    aiAir: summary.finalAiAir,
    playerPool: summary.playerPool,
    aiPool: summary.aiPool,
    currentRound: {
      phase: 'gameOver',
      finalResult: summary,
    },
  };
}

function getLogDetails(event: string): unknown {
  return getDebugLogs().find((entry) => entry.event === event)?.details;
}

describe('app/game-session', () => {
  beforeEach(() => {
    vi.stubGlobal('Storage', MemoryStorage);
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    clearDebugLogs();
  });

  it('creates an idle session with provided seed and passthrough last result', () => {
    const session = createNewGameSession({
      settings: customSettings,
      seed: 'manual-seed',
      lastResult,
    });

    expect(session.seed).toBe('manual-seed');
    expect(session.state.phase).toBe('idle');
    expect(session.state.settingsSnapshot).toStrictEqual(customSettings);
    expect(session.lastResult).toStrictEqual(lastResult);
    expect(getLogDetails('game-session:create')).toMatchObject({
      phase: 'idle',
      seed: 'manual-seed',
      hasLastResult: true,
    });
  });

  it('creates a runtime seed when no seed is provided', () => {
    const session = createNewGameSession({ settings: DEFAULT_SETTINGS });

    expect(session.seed).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(session.state.phase).toBe('idle');
  });

  it('dispatches through gameReducer and keeps session state current', () => {
    const session = createNewGameSession({
      settings: DEFAULT_SETTINGS,
      seed: 'manual-seed',
    });

    const next = session.dispatch({
      type: 'updateSettings',
      patch: { showAIDebug: true },
    });

    expect(session.state).toBe(next);
    expect(next.settingsSnapshot.showAIDebug).toBe(true);
    expect(getLogDetails('game-session:dispatch')).toMatchObject({
      action: 'updateSettings',
      fromPhase: 'idle',
      toPhase: 'idle',
    });
  });

  it('does not throw when reducer rejects an out-of-phase action', () => {
    const state = createIdleState(DEFAULT_SETTINGS);

    const next = dispatchGameAction(state, { type: 'applyRoundCosts' });

    expect(next.phase).toBe('idle');
    expect(next.lastError?.code).toBe('wrong-phase');
  });

  it('does not persist in-progress game state', () => {
    const state = createIdleState(DEFAULT_SETTINGS);

    expect(persistResultIfGameOver(state)).toBeNull();
    expect(localStorage.getItem(LAST_RESULT_STORAGE_KEY)).toBeNull();
    expect(loadLastResult()).toBeNull();
  });

  it('persists only the gameOver summary and does not duplicate writes', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const state = createGameOverState();

    expect(persistResultIfGameOver(state)).toStrictEqual({ ok: true });
    expect(persistResultIfGameOver(state)).toStrictEqual({ ok: true });

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(loadLastResult()).toStrictEqual(lastResult);

    const raw = localStorage.getItem(LAST_RESULT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed: unknown = JSON.parse(raw!);
    expect(parsed).toStrictEqual(lastResult);
    expect(getLogDetails('last-result:persist')).toMatchObject({
      result: 'saved',
      seed: lastResult.seed,
    });
  });
});

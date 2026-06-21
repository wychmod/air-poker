import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SETTINGS,
  loadLastResult,
  loadSettings,
  saveLastResult,
  saveSettings,
} from './settings';
import type { LastResultSummary, Settings } from './settings';

const settingsKey = 'air-poker.settings';
const lastResultKey = 'air-poker.last-result';

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

describe('app/settings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads default settings when storage is empty or invalid', () => {
    expect(loadSettings()).toStrictEqual(DEFAULT_SETTINGS);

    localStorage.setItem(settingsKey, '{bad json');

    expect(loadSettings()).toStrictEqual(DEFAULT_SETTINGS);
  });

  it('saves and loads settings through localStorage', () => {
    expect(saveSettings(customSettings)).toStrictEqual({ ok: true });
    expect(loadSettings()).toStrictEqual(customSettings);
  });

  it('returns storage-unavailable when settings cannot be saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(saveSettings(customSettings)).toStrictEqual({
      ok: false,
      code: 'storage-unavailable',
    });
  });

  it('saves and loads the latest result summary', () => {
    expect(saveLastResult(lastResult)).toStrictEqual({ ok: true });
    expect(loadLastResult()).toStrictEqual(lastResult);
  });

  it('drops invalid latest result summaries', () => {
    localStorage.setItem(lastResultKey, '{bad json');

    expect(loadLastResult()).toBeNull();
    expect(localStorage.getItem(lastResultKey)).toBeNull();
  });

  it('returns storage-unavailable when latest result cannot be saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(saveLastResult(lastResult)).toStrictEqual({
      ok: false,
      code: 'storage-unavailable',
    });
  });
});

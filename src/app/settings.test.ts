import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SETTINGS,
  LAST_RESULT_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  loadLastResult,
  loadSettings,
  saveLastResult,
  saveSettings,
} from './settings';
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

class MismatchStorage extends MemoryStorage {
  override getItem(key: string): string | null {
    if (key === SETTINGS_STORAGE_KEY || key === LAST_RESULT_STORAGE_KEY) {
      return '{"version":1,"corrupted":true}';
    }

    return super.getItem(key);
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

describe('app/settings', () => {
  beforeEach(() => {
    vi.stubGlobal('Storage', MemoryStorage);
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('loads default settings when storage is empty or invalid', () => {
    expect(loadSettings()).toStrictEqual(DEFAULT_SETTINGS);

    localStorage.setItem(SETTINGS_STORAGE_KEY, '{bad json');

    expect(loadSettings()).toStrictEqual(DEFAULT_SETTINGS);
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it('loads default settings and removes storage when version mismatches', () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...customSettings, version: 2 }),
    );

    expect(loadSettings()).toStrictEqual(DEFAULT_SETTINGS);
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it('saves and loads settings through localStorage', () => {
    expect(saveSettings(customSettings)).toStrictEqual({ ok: true });
    expect(loadSettings()).toStrictEqual(customSettings);
  });

  it('filters non-settings fields before saving settings', () => {
    const unsafeSettings = {
      ...customSettings,
      seed: 'should-not-persist',
      aiAir: 25,
      numberCards: [],
    } as Settings;

    expect(saveSettings(unsafeSettings)).toStrictEqual({ ok: true });

    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toStrictEqual(customSettings);
  });

  it('returns storage-unavailable when settings readback validation fails', () => {
    vi.stubGlobal('localStorage', new MismatchStorage());

    expect(saveSettings(customSettings)).toStrictEqual({
      ok: false,
      code: 'storage-unavailable',
    });
  });

  it('loads default settings when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(loadSettings()).toStrictEqual(DEFAULT_SETTINGS);
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
    localStorage.setItem(LAST_RESULT_STORAGE_KEY, '{bad json');

    expect(loadLastResult()).toBeNull();
    expect(localStorage.getItem(LAST_RESULT_STORAGE_KEY)).toBeNull();
  });

  it('drops latest result summaries with mismatched version', () => {
    localStorage.setItem(
      LAST_RESULT_STORAGE_KEY,
      JSON.stringify({ ...lastResult, version: 2 }),
    );

    expect(loadLastResult()).toBeNull();
    expect(localStorage.getItem(LAST_RESULT_STORAGE_KEY)).toBeNull();
  });

  it('filters non-summary fields before saving the latest result', () => {
    const unsafeResult = {
      ...lastResult,
      currentRound: { phase: 'roundSummary' },
      roundHistory: [{ roundNumber: 1 }],
    } as LastResultSummary;

    expect(saveLastResult(unsafeResult)).toStrictEqual({ ok: true });

    const raw = localStorage.getItem(LAST_RESULT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toStrictEqual(lastResult);
  });

  it('returns storage-unavailable when latest result readback validation fails', () => {
    vi.stubGlobal('localStorage', new MismatchStorage());

    expect(saveLastResult(lastResult)).toStrictEqual({
      ok: false,
      code: 'storage-unavailable',
    });
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

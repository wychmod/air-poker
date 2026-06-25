import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearDebugLogs,
  configureDebugLogger,
  type DebugLogEntry,
  getDebugLogs,
  initializeDebugLoggerFromRuntime,
  isDebugLogPrintingEnabled,
  logDebugEvent,
} from './debug-log';

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

describe('app/debug-log', () => {
  beforeEach(() => {
    clearDebugLogs();
    configureDebugLogger({ enabled: false, maxEntries: 200 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearDebugLogs();
    configureDebugLogger({ enabled: false, maxEntries: 200 });
  });

  it('records structured log entries in memory and exposes a global snapshot', () => {
    const entry = logDebugEvent(
      'game:init',
      { seed: 'seed-001' },
      { now: () => '2026-06-21T00:00:00.000Z' },
    );

    expect(entry).toStrictEqual({
      id: 1,
      at: '2026-06-21T00:00:00.000Z',
      event: 'game:init',
      level: 'info',
      details: { seed: 'seed-001' },
    });
    expect(getDebugLogs()).toStrictEqual([entry]);
    const globalWithLogs = globalThis as typeof globalThis & {
      __AIR_POKER_DEBUG_LOGS__?: DebugLogEntry[];
    };
    expect(globalWithLogs.__AIR_POKER_DEBUG_LOGS__).toStrictEqual([entry]);
  });

  it('keeps only the latest maxEntries entries', () => {
    configureDebugLogger({ maxEntries: 2 });

    logDebugEvent('one');
    logDebugEvent('two');
    logDebugEvent('three');

    expect(getDebugLogs().map((entry) => entry.event)).toStrictEqual(['two', 'three']);
  });

  it('prints to console only when enabled', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logDebugEvent('quiet:event');
    expect(consoleInfo).not.toHaveBeenCalled();

    configureDebugLogger({ enabled: true });
    logDebugEvent('printed:event');

    expect(consoleInfo).toHaveBeenCalledWith(
      '[air-poker]',
      'printed:event',
      expect.objectContaining({ event: 'printed:event' }),
    );
  });

  it('can be enabled from localStorage', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    localStorage.setItem('air-poker.debug', '1');

    expect(initializeDebugLoggerFromRuntime()).toBe(true);
    expect(isDebugLogPrintingEnabled()).toBe(true);
  });
});

import { logDebugEvent } from './debug-log';

export type Theme = 'light' | 'dark' | 'system';

export type Settings = {
  version: 1;
  soundEnabled: boolean;
  theme: Theme;
  reduceMotion: boolean;
  showAIDebug: boolean;
};

export type Outcome = 'playerWin' | 'aiWin' | 'tie';
export type EndReason =
  | 'airDepleted'
  | 'fiveRounds'
  | 'tiebreaker'
  | 'earlyTermination'
  | 'draw';

export type LastResultSummary = {
  version: 1;
  seed: string;
  outcome: Outcome;
  endReason: EndReason;
  finalPlayerAir: number;
  finalAiAir: number;
  roundsPlayed: number;
  playerPool: number;
  aiPool: number;
  calamityCount: number;
  playerAllInCount: number;
  aiAllInCount: number;
  timestamp: string;
};

export type StorageResult = { ok: true } | { ok: false; code: 'storage-unavailable' };

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  soundEnabled: true,
  theme: 'system',
  reduceMotion: false,
  showAIDebug: false,
};

const SETTINGS_KEY = 'air-poker.settings';
const LAST_RESULT_KEY = 'air-poker.last-result';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function isSettings(value: unknown): value is Settings {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.soundEnabled === 'boolean' &&
    isTheme(value.theme) &&
    typeof value.reduceMotion === 'boolean' &&
    typeof value.showAIDebug === 'boolean'
  );
}

function isOutcome(value: unknown): value is Outcome {
  return value === 'playerWin' || value === 'aiWin' || value === 'tie';
}

function isEndReason(value: unknown): value is EndReason {
  return (
    value === 'airDepleted' ||
    value === 'fiveRounds' ||
    value === 'tiebreaker' ||
    value === 'earlyTermination' ||
    value === 'draw'
  );
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isLastResultSummary(value: unknown): value is LastResultSummary {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.seed === 'string' &&
    isOutcome(value.outcome) &&
    isEndReason(value.endReason) &&
    isNumber(value.finalPlayerAir) &&
    isNumber(value.finalAiAir) &&
    isNumber(value.roundsPlayed) &&
    isNumber(value.playerPool) &&
    isNumber(value.aiPool) &&
    isNumber(value.calamityCount) &&
    isNumber(value.playerAllInCount) &&
    isNumber(value.aiAllInCount) &&
    typeof value.timestamp === 'string'
  );
}

function safeRemoveItem(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage cleanup is best-effort; gameplay must continue without persistence.
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);

    if (raw === null) {
      logDebugEvent('settings:load', { result: 'default', reason: 'missing' });
      return DEFAULT_SETTINGS;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isSettings(parsed)) {
      logDebugEvent('settings:load', { result: 'default', reason: 'invalid-shape' });
      return DEFAULT_SETTINGS;
    }

    logDebugEvent('settings:load', {
      result: 'stored',
      theme: parsed.theme,
      soundEnabled: parsed.soundEnabled,
      reduceMotion: parsed.reduceMotion,
      showAIDebug: parsed.showAIDebug,
    });

    return parsed;
  } catch {
    logDebugEvent(
      'settings:load',
      { result: 'default', reason: 'storage-error' },
      {
        level: 'warn',
      },
    );
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): StorageResult {
  try {
    const serialized = JSON.stringify(settings);
    localStorage.setItem(SETTINGS_KEY, serialized);

    if (localStorage.getItem(SETTINGS_KEY) !== serialized) {
      logDebugEvent(
        'settings:save',
        {
          result: 'failed',
          code: 'storage-unavailable',
          reason: 'readback-mismatch',
        },
        {
          level: 'warn',
        },
      );
      return { ok: false, code: 'storage-unavailable' };
    }

    logDebugEvent('settings:save', {
      result: 'saved',
      theme: settings.theme,
      soundEnabled: settings.soundEnabled,
      reduceMotion: settings.reduceMotion,
      showAIDebug: settings.showAIDebug,
    });

    return { ok: true };
  } catch {
    logDebugEvent(
      'settings:save',
      {
        result: 'failed',
        code: 'storage-unavailable',
        reason: 'storage-error',
      },
      {
        level: 'warn',
      },
    );
    return { ok: false, code: 'storage-unavailable' };
  }
}

export function loadLastResult(): LastResultSummary | null {
  try {
    const raw = localStorage.getItem(LAST_RESULT_KEY);

    if (raw === null) {
      logDebugEvent('last-result:load', { result: 'empty' });
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isLastResultSummary(parsed)) {
      safeRemoveItem(LAST_RESULT_KEY);
      logDebugEvent(
        'last-result:load',
        {
          result: 'dropped',
          reason: 'invalid-shape',
        },
        {
          level: 'warn',
        },
      );
      return null;
    }

    logDebugEvent('last-result:load', {
      result: 'stored',
      seed: parsed.seed,
      outcome: parsed.outcome,
      endReason: parsed.endReason,
      roundsPlayed: parsed.roundsPlayed,
      finalPlayerAir: parsed.finalPlayerAir,
      finalAiAir: parsed.finalAiAir,
    });

    return parsed;
  } catch {
    safeRemoveItem(LAST_RESULT_KEY);
    logDebugEvent(
      'last-result:load',
      {
        result: 'dropped',
        reason: 'storage-error',
      },
      {
        level: 'warn',
      },
    );
    return null;
  }
}

export function saveLastResult(summary: LastResultSummary): StorageResult {
  try {
    const serialized = JSON.stringify(summary);
    localStorage.setItem(LAST_RESULT_KEY, serialized);

    if (localStorage.getItem(LAST_RESULT_KEY) !== serialized) {
      logDebugEvent(
        'last-result:save',
        {
          result: 'failed',
          code: 'storage-unavailable',
          reason: 'readback-mismatch',
        },
        {
          level: 'warn',
        },
      );
      return { ok: false, code: 'storage-unavailable' };
    }

    logDebugEvent('last-result:save', {
      result: 'saved',
      seed: summary.seed,
      outcome: summary.outcome,
      endReason: summary.endReason,
      roundsPlayed: summary.roundsPlayed,
      finalPlayerAir: summary.finalPlayerAir,
      finalAiAir: summary.finalAiAir,
    });

    return { ok: true };
  } catch {
    logDebugEvent(
      'last-result:save',
      {
        result: 'failed',
        code: 'storage-unavailable',
        reason: 'storage-error',
      },
      {
        level: 'warn',
      },
    );
    return { ok: false, code: 'storage-unavailable' };
  }
}

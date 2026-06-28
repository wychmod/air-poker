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

export type SaveResult = { ok: true } | { ok: false; code: 'storage-unavailable' };
export type StorageResult = SaveResult;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  soundEnabled: true,
  theme: 'system',
  reduceMotion: false,
  showAIDebug: false,
};

export const SETTINGS_STORAGE_KEY = 'air-poker.settings';
export const LAST_RESULT_STORAGE_KEY = 'air-poker.last-result';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function isSettings(value: unknown): value is Settings {
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

export function isLastResultSummary(value: unknown): value is LastResultSummary {
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

function copyDefaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS };
}

function sanitizeSettings(settings: Settings): Settings {
  return {
    version: 1,
    soundEnabled: settings.soundEnabled,
    theme: settings.theme,
    reduceMotion: settings.reduceMotion,
    showAIDebug: settings.showAIDebug,
  };
}

function sanitizeLastResult(summary: LastResultSummary): LastResultSummary {
  return {
    version: 1,
    seed: summary.seed,
    outcome: summary.outcome,
    endReason: summary.endReason,
    finalPlayerAir: summary.finalPlayerAir,
    finalAiAir: summary.finalAiAir,
    roundsPlayed: summary.roundsPlayed,
    playerPool: summary.playerPool,
    aiPool: summary.aiPool,
    calamityCount: summary.calamityCount,
    playerAllInCount: summary.playerAllInCount,
    aiAllInCount: summary.aiAllInCount,
    timestamp: summary.timestamp,
  };
}

function warnStorageUnavailable(source: 'settings:save' | 'last-result:save'): void {
  console.warn('[air-poker:persistence]', {
    source,
    code: 'storage-unavailable',
  });
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);

    if (raw === null) {
      logDebugEvent('settings:load', { result: 'default', reason: 'missing' });
      return copyDefaultSettings();
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isSettings(parsed)) {
      safeRemoveItem(SETTINGS_STORAGE_KEY);
      logDebugEvent('settings:load', { result: 'default', reason: 'invalid-shape' });
      return copyDefaultSettings();
    }

    logDebugEvent('settings:load', {
      result: 'stored',
      theme: parsed.theme,
      soundEnabled: parsed.soundEnabled,
      reduceMotion: parsed.reduceMotion,
      showAIDebug: parsed.showAIDebug,
    });

    return sanitizeSettings(parsed);
  } catch {
    safeRemoveItem(SETTINGS_STORAGE_KEY);
    logDebugEvent(
      'settings:load',
      { result: 'default', reason: 'storage-error' },
      {
        level: 'warn',
      },
    );
    return copyDefaultSettings();
  }
}

export function saveSettings(settings: Settings): SaveResult {
  try {
    const safeSettings = sanitizeSettings(settings);
    const serialized = JSON.stringify(safeSettings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, serialized);
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);

    if (saved !== serialized || !isSettings(JSON.parse(saved))) {
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
      warnStorageUnavailable('settings:save');
      return { ok: false, code: 'storage-unavailable' };
    }

    logDebugEvent('settings:save', {
      result: 'saved',
      theme: safeSettings.theme,
      soundEnabled: safeSettings.soundEnabled,
      reduceMotion: safeSettings.reduceMotion,
      showAIDebug: safeSettings.showAIDebug,
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
    warnStorageUnavailable('settings:save');
    return { ok: false, code: 'storage-unavailable' };
  }
}

export function loadLastResult(): LastResultSummary | null {
  try {
    const raw = localStorage.getItem(LAST_RESULT_STORAGE_KEY);

    if (raw === null) {
      logDebugEvent('last-result:load', { result: 'empty' });
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isLastResultSummary(parsed)) {
      safeRemoveItem(LAST_RESULT_STORAGE_KEY);
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

    return sanitizeLastResult(parsed);
  } catch {
    safeRemoveItem(LAST_RESULT_STORAGE_KEY);
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

export function saveLastResult(summary: LastResultSummary): SaveResult {
  try {
    const safeSummary = sanitizeLastResult(summary);
    const serialized = JSON.stringify(safeSummary);
    localStorage.setItem(LAST_RESULT_STORAGE_KEY, serialized);
    const saved = localStorage.getItem(LAST_RESULT_STORAGE_KEY);

    if (saved !== serialized || !isLastResultSummary(JSON.parse(saved))) {
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
      warnStorageUnavailable('last-result:save');
      return { ok: false, code: 'storage-unavailable' };
    }

    logDebugEvent('last-result:save', {
      result: 'saved',
      seed: safeSummary.seed,
      outcome: safeSummary.outcome,
      endReason: safeSummary.endReason,
      roundsPlayed: safeSummary.roundsPlayed,
      finalPlayerAir: safeSummary.finalPlayerAir,
      finalAiAir: safeSummary.finalAiAir,
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
    warnStorageUnavailable('last-result:save');
    return { ok: false, code: 'storage-unavailable' };
  }
}

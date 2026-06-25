export type DebugLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type DebugLogEventName =
  | 'app:boot'
  | 'app:root-found'
  | 'app:mounted'
  | 'debug-log:configured'
  | 'error:captured'
  | 'last-result:load'
  | 'last-result:save'
  | 'rng:runtime-created'
  | 'rng:runtime-seed-created'
  | 'rng:seeded-created'
  | 'rng:seeded-rejected'
  | 'settings:load'
  | 'settings:save'
  | (string & {});

export type DebugLogEntry = {
  id: number;
  at: string;
  event: DebugLogEventName;
  level: DebugLogLevel;
  details?: unknown;
};

type DebugLoggerConfig = {
  enabled?: boolean;
  maxEntries?: number;
};

type DebugLogOptions = {
  level?: DebugLogLevel;
  print?: boolean;
  now?: () => string;
};

type DebugLogGlobal = typeof globalThis & {
  __AIR_POKER_DEBUG_LOGS__?: DebugLogEntry[];
};

const DEFAULT_MAX_DEBUG_LOG_ENTRIES = 200;
const DEBUG_STORAGE_KEYS = ['air-poker.debug', 'air-poker.debug-log'];

let nextEntryId = 1;
let consolePrintingEnabled = false;
let maxEntries = DEFAULT_MAX_DEBUG_LOG_ENTRIES;
const entries: DebugLogEntry[] = [];

function getGlobalLogHost(): DebugLogGlobal {
  return globalThis;
}

function syncGlobalLogs(): void {
  getGlobalLogHost().__AIR_POKER_DEBUG_LOGS__ = entries;
}

function trimEntries(): void {
  while (entries.length > maxEntries) {
    entries.shift();
  }
}

function normalizeMaxEntries(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_DEBUG_LOG_ENTRIES;
}

function getRuntimeSearch(): string {
  const runtime = globalThis as typeof globalThis & {
    location?: { search?: string };
  };

  return runtime.location?.search ?? '';
}

function isDebugEnabledByUrl(): boolean {
  const search = getRuntimeSearch();

  if (search === '') {
    return false;
  }

  const params = new URLSearchParams(search);
  return params.get('debug') === '1' || params.get('debugLog') === '1';
}

function isDebugEnabledByStorage(): boolean {
  try {
    for (const key of DEBUG_STORAGE_KEYS) {
      if (globalThis.localStorage?.getItem(key) === '1') {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

function printLogEntry(entry: DebugLogEntry): void {
  switch (entry.level) {
    case 'debug':
      console.debug('[air-poker]', entry.event, entry);
      break;
    case 'warn':
      console.warn('[air-poker]', entry.event, entry);
      break;
    case 'error':
      console.error('[air-poker]', entry.event, entry);
      break;
    case 'info':
      console.info('[air-poker]', entry.event, entry);
      break;
    default:
      console.info('[air-poker]', entry.event, entry);
  }
}

export function configureDebugLogger(config: DebugLoggerConfig): void {
  if (config.enabled !== undefined) {
    consolePrintingEnabled = config.enabled;
  }

  if (config.maxEntries !== undefined) {
    maxEntries = normalizeMaxEntries(config.maxEntries);
    trimEntries();
  }

  syncGlobalLogs();
}

export function initializeDebugLoggerFromRuntime(): boolean {
  const enabled = isDebugEnabledByUrl() || isDebugEnabledByStorage();
  configureDebugLogger({ enabled });

  return enabled;
}

export function isDebugLogPrintingEnabled(): boolean {
  return consolePrintingEnabled;
}

export function logDebugEvent(
  event: DebugLogEventName,
  details?: unknown,
  options: DebugLogOptions = {},
): DebugLogEntry {
  const entry: DebugLogEntry = {
    id: nextEntryId,
    at: options.now?.() ?? new Date().toISOString(),
    event,
    level: options.level ?? 'info',
    ...(details === undefined ? {} : { details }),
  };

  nextEntryId += 1;
  entries.push(entry);
  trimEntries();
  syncGlobalLogs();

  if (options.print ?? consolePrintingEnabled) {
    printLogEntry(entry);
  }

  return entry;
}

export function getDebugLogs(): DebugLogEntry[] {
  return [...entries];
}

export function clearDebugLogs(): void {
  entries.splice(0, entries.length);
  nextEntryId = 1;
  syncGlobalLogs();
}

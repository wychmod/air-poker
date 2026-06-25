import { type ErrorPayload, normalizeError } from '../domain/errors';
import { logDebugEvent } from './debug-log';

export type GlobalErrorSource = 'window-error' | 'unhandledrejection';

export type CapturedGlobalError = ErrorPayload & {
  source: GlobalErrorSource;
};

export type GlobalErrorHandler = (error: CapturedGlobalError) => void;

export function reportGlobalError(error: CapturedGlobalError): void {
  logDebugEvent('error:captured', error, { level: 'error' });
  console.error('[air-poker:error]', error);
}

function getUnhandledRejectionReason(event: Event): unknown {
  const eventWithReason = event as Event & { reason?: unknown };

  return eventWithReason.reason ?? event;
}

export function installGlobalErrorHandlers(onError: GlobalErrorHandler): () => void {
  const handleWindowError = (event: ErrorEvent) => {
    const error = {
      ...normalizeError(event.error ?? event.message),
      source: 'window-error',
    } as const;

    onError(error);
  };

  const handleUnhandledRejection = (event: Event) => {
    const error = {
      ...normalizeError(getUnhandledRejectionReason(event)),
      source: 'unhandledrejection',
    } as const;

    onError(error);
  };

  window.addEventListener('error', handleWindowError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    window.removeEventListener('error', handleWindowError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}

import { type ErrorPayload, normalizeError } from '../domain/errors';

export type GlobalErrorSource = 'window-error' | 'unhandledrejection';

export type CapturedGlobalError = ErrorPayload & {
  source: GlobalErrorSource;
};

export type GlobalErrorHandler = (error: CapturedGlobalError) => void;

export function reportGlobalError(error: CapturedGlobalError): void {
  console.error('[air-poker:error]', error);
}

function getUnhandledRejectionReason(event: Event): unknown {
  const eventWithReason = event as Event & { reason?: unknown };

  return eventWithReason.reason ?? event;
}

export function installGlobalErrorHandlers(onError: GlobalErrorHandler): () => void {
  const handleWindowError = (event: ErrorEvent) => {
    onError({
      ...normalizeError(event.error ?? event.message),
      source: 'window-error',
    });
  };

  const handleUnhandledRejection = (event: Event) => {
    onError({
      ...normalizeError(getUnhandledRejectionReason(event)),
      source: 'unhandledrejection',
    });
  };

  window.addEventListener('error', handleWindowError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    window.removeEventListener('error', handleWindowError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}

export type ErrorPayload = {
  code: string;
  message: string;
  phase?: string;
  details?: unknown;
};

type AppErrorOptions = {
  phase?: string;
  details?: unknown;
};

export class AppError extends Error implements ErrorPayload {
  readonly code: string;
  readonly phase?: string;
  readonly details?: unknown;

  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;

    if (options.phase !== undefined) {
      this.phase = options.phase;
    }

    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export function createAppError(
  code: string,
  message: string,
  options: AppErrorOptions = {},
): AppError {
  return new AppError(code, message, options);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toErrorPayload(error: AppError): ErrorPayload {
  return {
    code: error.code,
    message: error.message,
    ...(error.phase === undefined ? {} : { phase: error.phase }),
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}

export function normalizeError(error: unknown): ErrorPayload {
  if (isAppError(error)) {
    return toErrorPayload(error);
  }

  if (error instanceof Error) {
    return {
      code: 'unexpected-error',
      message: error.message || 'Unexpected error',
    };
  }

  if (typeof error === 'string') {
    return {
      code: 'unexpected-error',
      message: error,
    };
  }

  return {
    code: 'unexpected-error',
    message: 'Unexpected error',
    details: error,
  };
}

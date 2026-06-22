import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installGlobalErrorHandlers, reportGlobalError } from './global-errors';

describe('app/global-errors', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    vi.stubGlobal('window', new EventTarget());
  });

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  it('captures window error events as normalized payloads', () => {
    const onError = vi.fn();
    cleanups.push(installGlobalErrorHandlers(onError));
    const event = new Event('error');
    Object.defineProperties(event, {
      error: {
        value: new Error('Render failed'),
      },
      message: {
        value: 'Render failed',
      },
    });

    window.dispatchEvent(event);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'unexpected-error',
        message: 'Render failed',
        source: 'window-error',
      }),
    );
  });

  it('captures unhandled rejection events as normalized payloads', () => {
    const onError = vi.fn();
    cleanups.push(installGlobalErrorHandlers(onError));
    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', {
      value: new Error('Async failed'),
    });

    window.dispatchEvent(event);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'unexpected-error',
        message: 'Async failed',
        source: 'unhandledrejection',
      }),
    );
  });

  it('reports captured errors through the default reporter', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    reportGlobalError({
      code: 'unexpected-error',
      message: 'Render failed',
      source: 'window-error',
    });

    expect(consoleError).toHaveBeenCalledWith('[air-poker:error]', {
      code: 'unexpected-error',
      message: 'Render failed',
      source: 'window-error',
    });
  });
});

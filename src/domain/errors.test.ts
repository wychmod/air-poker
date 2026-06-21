import { describe, expect, it } from 'vitest';

import { createAppError, isAppError, normalizeError, toErrorPayload } from './errors';

describe('domain/errors', () => {
  it('creates structured application errors', () => {
    const error = createAppError('invalid-card-rank', 'Invalid card rank', {
      details: { rank: 'joker' },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      code: 'invalid-card-rank',
      message: 'Invalid card rank',
      details: { rank: 'joker' },
    });
    expect(isAppError(error)).toBe(true);
  });

  it('normalizes unknown errors into the shared payload shape', () => {
    expect(normalizeError(new Error('Boom'))).toMatchObject({
      code: 'unexpected-error',
      message: 'Boom',
    });

    expect(normalizeError('plain string')).toMatchObject({
      code: 'unexpected-error',
      message: 'plain string',
    });
  });

  it('converts application errors to serializable payloads', () => {
    const error = createAppError('storage-unavailable', 'Storage unavailable', {
      phase: 'idle',
      details: { key: 'air-poker.settings' },
    });

    expect(toErrorPayload(error)).toStrictEqual({
      code: 'storage-unavailable',
      message: 'Storage unavailable',
      phase: 'idle',
      details: { key: 'air-poker.settings' },
    });
  });
});

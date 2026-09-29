import { retryOnConflict } from './retry-on-conflict';
import { ConcurrencyError } from '../domain/errors/concurrency.error';

describe('retryOnConflict', () => {
  it('returns the result on the first successful attempt', async () => {
    const result = await retryOnConflict(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('retries after a ConcurrencyError and succeeds on a later attempt', async () => {
    let attempts = 0;
    const result = await retryOnConflict(async () => {
      attempts++;
      if (attempts < 3) throw new ConcurrencyError('booking-1', attempts);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('gives up after maxAttempts and throws the last ConcurrencyError', async () => {
    let attempts = 0;
    await expect(
      retryOnConflict(async () => {
        attempts++;
        throw new ConcurrencyError('booking-1', attempts);
      }, 3),
    ).rejects.toThrow(ConcurrencyError);

    expect(attempts).toBe(3);
  });

  it('does not retry a non-ConcurrencyError -- it propagates immediately', async () => {
    let attempts = 0;
    await expect(
      retryOnConflict(async () => {
        attempts++;
        throw new Error('something else entirely');
      }),
    ).rejects.toThrow('something else entirely');

    expect(attempts).toBe(1);
  });
});

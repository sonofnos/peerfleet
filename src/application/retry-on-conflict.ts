import { ConcurrencyError } from '../domain/errors/concurrency.error';

/**
 * Retries a load-mutate-save cycle when it loses an optimistic-lock race.
 * Bounded (not infinite) because a version that keeps moving out from
 * under every retry means something is genuinely wrong, not just unlucky
 * timing -- an unbounded retry would hide that.
 */
export async function retryOnConflict<T>(
  attempt: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof ConcurrencyError)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError;
}

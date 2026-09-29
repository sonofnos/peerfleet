/** Raised when an optimistic-lock update finds the row's version has
 * already moved -- someone else committed a change since this aggregate
 * was loaded. The caller decides whether to retry with a fresh read. */
export class ConcurrencyError extends Error {
  constructor(aggregateId: string, expectedVersion: number) {
    super(
      `Booking ${aggregateId} was modified concurrently (expected version ${expectedVersion})`,
    );
  }
}

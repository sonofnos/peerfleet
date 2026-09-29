import { Booking } from '../entities/booking.aggregate';
import { BookingPeriod } from '../value-objects/booking-period.vo';

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');

/**
 * A port: the domain and application layers depend on this interface only.
 * The concrete Prisma implementation lives in the infrastructure layer and
 * is wired in by the Nest module -- nothing above this file knows Prisma
 * exists.
 */
export interface BookingRepository {
  findById(id: string): Promise<Booking | null>;

  /** True if any non-cancelled booking for this vehicle overlaps the given
   * period. Used as the application-level half of double-booking
   * prevention (the other half is a DB constraint, see the infra layer). */
  hasOverlappingActiveBooking(
    vehicleId: string,
    period: BookingPeriod,
    excludingBookingId?: string,
  ): Promise<boolean>;

  /** Persists a new booking and its pending domain events atomically. */
  create(booking: Booking): Promise<void>;

  /** Persists a state change via optimistic locking (WHERE version = booking.version)
   * plus its pending domain events, atomically. Throws ConcurrencyError if
   * the row's version has already moved. */
  save(booking: Booking): Promise<void>;
}

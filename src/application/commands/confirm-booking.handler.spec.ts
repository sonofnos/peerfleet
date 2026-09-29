import { ConfirmBookingHandler } from './confirm-booking.handler';
import { ConfirmBookingCommand } from './confirm-booking.command';
import { Booking } from '../../domain/entities/booking.aggregate';
import { BookingPeriod } from '../../domain/value-objects/booking-period.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { BookingRepository } from '../../domain/repositories/booking.repository';
import { ConcurrencyError } from '../../domain/errors/concurrency.error';
import { BookingNotFoundError } from '../../domain/errors/booking-not-found.error';

function makeBooking(): Booking {
  return Booking.request({
    vehicleId: 'vehicle-1',
    hostId: 'host-1',
    renterId: 'renter-1',
    period: BookingPeriod.of(new Date('2027-01-01'), new Date('2027-01-02')),
    totalPrice: Money.of(50_000, 'NGN'),
  });
}

class FakeBookingRepository implements BookingRepository {
  public conflictsBeforeSuccess = 0;
  public savedStatuses: string[] = [];
  private persisted: Booking | null;

  constructor(booking: Booking | null) {
    this.persisted = booking;
  }

  // Reconstitutes a fresh instance from what's actually persisted, the
  // same way a real DB-backed repository would -- a failed save() must
  // not leave the in-memory aggregate looking like it succeeded.
  async findById(): Promise<Booking | null> {
    if (!this.persisted) return null;

    return Booking.reconstitute({
      id: this.persisted.id,
      vehicleId: this.persisted.vehicleId,
      hostId: this.persisted.hostId,
      renterId: this.persisted.renterId,
      period: this.persisted.period,
      totalPrice: this.persisted.totalPrice,
      status: this.persisted.getStatus(),
      cancellationReason: this.persisted.getCancellationReason(),
      version: this.persisted.version,
    });
  }

  async hasOverlappingActiveBooking(): Promise<boolean> {
    return false;
  }

  async create(): Promise<void> {
    throw new Error('not used in this test');
  }

  async save(booking: Booking): Promise<void> {
    if (this.conflictsBeforeSuccess > 0) {
      this.conflictsBeforeSuccess--;
      throw new ConcurrencyError(booking.id, booking.version);
    }
    this.savedStatuses.push(booking.getStatus());
    this.persisted = booking;
  }
}

describe('ConfirmBookingHandler', () => {
  it('confirms the booking and saves it', async () => {
    const repo = new FakeBookingRepository(makeBooking());
    const handler = new ConfirmBookingHandler(repo);

    await handler.execute(new ConfirmBookingCommand('booking-1'));

    expect(repo.savedStatuses).toEqual(['CONFIRMED']);
  });

  it('retries on a concurrency conflict and eventually succeeds', async () => {
    const repo = new FakeBookingRepository(makeBooking());
    repo.conflictsBeforeSuccess = 2;
    const handler = new ConfirmBookingHandler(repo);

    await handler.execute(new ConfirmBookingCommand('booking-1'));

    expect(repo.savedStatuses).toEqual(['CONFIRMED']);
  });

  it('throws BookingNotFoundError for a missing booking', async () => {
    const handler = new ConfirmBookingHandler(new FakeBookingRepository(null));

    await expect(
      handler.execute(new ConfirmBookingCommand('missing')),
    ).rejects.toThrow(BookingNotFoundError);
  });
});

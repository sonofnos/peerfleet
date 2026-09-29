import { Booking, BookingStatus } from './booking.aggregate';
import { BookingPeriod } from '../value-objects/booking-period.vo';
import { Money } from '../value-objects/money.vo';
import { BookingInvariantError } from '../errors/booking-invariant.error';
import {
  BookingCancelledEvent,
  BookingCompletedEvent,
  BookingConfirmedEvent,
  BookingRequestedEvent,
} from '../events/booking-events';

function requestBooking(): Booking {
  return Booking.request({
    vehicleId: 'vehicle-1',
    hostId: 'host-1',
    renterId: 'renter-1',
    period: BookingPeriod.of(new Date('2027-01-01'), new Date('2027-01-03')),
    totalPrice: Money.of(100_000, 'NGN'),
  });
}

describe('Booking aggregate', () => {
  it('starts in Requested status and records a BookingRequestedEvent', () => {
    const booking = requestBooking();

    expect(booking.getStatus()).toBe(BookingStatus.Requested);
    const events = booking.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(BookingRequestedEvent);
  });

  it('pullDomainEvents drains events -- a second call returns nothing new', () => {
    const booking = requestBooking();
    booking.pullDomainEvents();
    expect(booking.pullDomainEvents()).toHaveLength(0);
  });

  it('confirm() moves Requested -> Confirmed and records BookingConfirmedEvent', () => {
    const booking = requestBooking();
    booking.pullDomainEvents();

    booking.confirm();

    expect(booking.getStatus()).toBe(BookingStatus.Confirmed);
    expect(booking.pullDomainEvents()[0]).toBeInstanceOf(BookingConfirmedEvent);
  });

  it('cannot confirm a booking that is not Requested', () => {
    const booking = requestBooking();
    booking.confirm();

    expect(() => booking.confirm()).toThrow(BookingInvariantError);
  });

  it('cancel() is allowed from Requested or Confirmed, not from Completed', () => {
    const booking = requestBooking();
    booking.confirm();
    booking.complete();

    expect(() => booking.cancel('changed my mind')).toThrow(
      BookingInvariantError,
    );
  });

  it('cancel() records the reason and a BookingCancelledEvent', () => {
    const booking = requestBooking();
    booking.pullDomainEvents();

    booking.cancel('renter no-show');

    expect(booking.getStatus()).toBe(BookingStatus.Cancelled);
    expect(booking.getCancellationReason()).toBe('renter no-show');
    expect(booking.pullDomainEvents()[0]).toBeInstanceOf(BookingCancelledEvent);
  });

  it('cannot cancel a booking twice', () => {
    const booking = requestBooking();
    booking.cancel('first cancellation');

    expect(() => booking.cancel('second cancellation')).toThrow(
      BookingInvariantError,
    );
  });

  it('complete() requires Confirmed or Active, and pays the host net of a 15% platform fee', () => {
    const booking = requestBooking();
    booking.confirm();
    booking.pullDomainEvents();

    const payout = booking.complete();

    expect(booking.getStatus()).toBe(BookingStatus.Completed);
    expect(payout.amountMinor).toBe(85_000); // 100_000 - 15%
    const event = booking.pullDomainEvents()[0] as BookingCompletedEvent;
    expect(event.payload.payoutMinor).toBe(85_000);
    expect(event.payload.hostId).toBe('host-1');
  });

  it('cannot complete a booking that was never confirmed', () => {
    const booking = requestBooking();
    expect(() => booking.complete()).toThrow(BookingInvariantError);
  });

  it('reconstitute() rebuilds state without raising any events', () => {
    const original = requestBooking();
    original.confirm();
    original.pullDomainEvents();

    const rebuilt = Booking.reconstitute({
      id: original.id,
      vehicleId: original.vehicleId,
      hostId: original.hostId,
      renterId: original.renterId,
      period: original.period,
      totalPrice: original.totalPrice,
      status: original.getStatus(),
      cancellationReason: null,
      version: 1,
    });

    expect(rebuilt.getStatus()).toBe(BookingStatus.Confirmed);
    expect(rebuilt.pullDomainEvents()).toHaveLength(0);
  });
});

import { randomUUID } from 'crypto';
import { BookingPeriod } from '../value-objects/booking-period.vo';
import { Money } from '../value-objects/money.vo';
import { DomainEvent } from '../events/domain-event.base';
import {
  BookingCancelledEvent,
  BookingCompletedEvent,
  BookingConfirmedEvent,
  BookingRequestedEvent,
} from '../events/booking-events';
import { BookingInvariantError } from '../errors/booking-invariant.error';

export enum BookingStatus {
  Requested = 'REQUESTED',
  Confirmed = 'CONFIRMED',
  Active = 'ACTIVE',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
}

/** The platform's cut of a completed booking, taken out of the host's payout. */
const PLATFORM_FEE_BASIS_POINTS = 1500; // 15%

export interface BookingSnapshot {
  id: string;
  vehicleId: string;
  hostId: string;
  renterId: string;
  period: BookingPeriod;
  totalPrice: Money;
  status: BookingStatus;
  cancellationReason: string | null;
  version: number;
}

/**
 * Aggregate root. Every state transition is a method that either succeeds
 * and records a domain event, or throws -- there is no way for a caller to
 * reach an invalid status directly, because `status` is never assigned
 * from outside these methods.
 */
export class Booking {
  private domainEvents: DomainEvent[] = [];

  private constructor(
    public readonly id: string,
    public readonly vehicleId: string,
    public readonly hostId: string,
    public readonly renterId: string,
    public readonly period: BookingPeriod,
    public readonly totalPrice: Money,
    private status: BookingStatus,
    private cancellationReason: string | null,
    public readonly version: number,
  ) {}

  static request(params: {
    vehicleId: string;
    hostId: string;
    renterId: string;
    period: BookingPeriod;
    totalPrice: Money;
  }): Booking {
    const booking = new Booking(
      randomUUID(),
      params.vehicleId,
      params.hostId,
      params.renterId,
      params.period,
      params.totalPrice,
      BookingStatus.Requested,
      null,
      0,
    );

    booking.record(
      new BookingRequestedEvent(booking.id, {
        vehicleId: params.vehicleId,
        hostId: params.hostId,
        renterId: params.renterId,
        totalPriceMinor: params.totalPrice.amountMinor,
        currency: params.totalPrice.currency,
      }),
    );

    return booking;
  }

  /** Rebuilds a Booking from persisted state. Never raises events -- this
   * is not a state transition, it's just deserialization. */
  static reconstitute(snapshot: BookingSnapshot): Booking {
    return new Booking(
      snapshot.id,
      snapshot.vehicleId,
      snapshot.hostId,
      snapshot.renterId,
      snapshot.period,
      snapshot.totalPrice,
      snapshot.status,
      snapshot.cancellationReason,
      snapshot.version,
    );
  }

  getStatus(): BookingStatus {
    return this.status;
  }

  getCancellationReason(): string | null {
    return this.cancellationReason;
  }

  confirm(): void {
    if (this.status !== BookingStatus.Requested) {
      throw new BookingInvariantError(
        `Cannot confirm a booking in status ${this.status}`,
      );
    }
    this.status = BookingStatus.Confirmed;
    this.record(new BookingConfirmedEvent(this.id));
  }

  cancel(reason: string): void {
    if (
      this.status === BookingStatus.Completed ||
      this.status === BookingStatus.Cancelled
    ) {
      throw new BookingInvariantError(
        `Cannot cancel a booking in status ${this.status}`,
      );
    }
    this.status = BookingStatus.Cancelled;
    this.cancellationReason = reason;
    this.record(new BookingCancelledEvent(this.id, { reason }));
  }

  /** Marks the rental as completed and computes the host's payout net of
   * the platform fee -- the payout amount is derived here, in the domain,
   * not left to whoever happens to read the completed event. */
  complete(): Money {
    if (
      this.status !== BookingStatus.Confirmed &&
      this.status !== BookingStatus.Active
    ) {
      throw new BookingInvariantError(
        `Cannot complete a booking in status ${this.status}`,
      );
    }
    this.status = BookingStatus.Completed;

    const platformFee = this.totalPrice.percentage(PLATFORM_FEE_BASIS_POINTS);
    const payout = this.totalPrice.subtract(platformFee);

    this.record(
      new BookingCompletedEvent(this.id, {
        hostId: this.hostId,
        payoutMinor: payout.amountMinor,
        currency: payout.currency,
      }),
    );

    return payout;
  }

  /** Drains and returns pending events -- called exactly once, by the
   * repository, in the same transaction that persists the state change. */
  pullDomainEvents(): DomainEvent[] {
    const events = this.domainEvents;
    this.domainEvents = [];
    return events;
  }

  private record(event: DomainEvent): void {
    this.domainEvents.push(event);
  }
}

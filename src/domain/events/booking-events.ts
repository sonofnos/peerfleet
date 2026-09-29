import { DomainEvent } from './domain-event.base';

export class BookingRequestedEvent extends DomainEvent {
  readonly eventType = 'booking.requested';

  constructor(
    readonly aggregateId: string,
    readonly payload: {
      vehicleId: string;
      hostId: string;
      renterId: string;
      totalPriceMinor: number;
      currency: string;
    },
  ) {
    super();
  }
}

export class BookingConfirmedEvent extends DomainEvent {
  readonly eventType = 'booking.confirmed';

  constructor(readonly aggregateId: string) {
    super();
  }
}

export class BookingCancelledEvent extends DomainEvent {
  readonly eventType = 'booking.cancelled';

  constructor(
    readonly aggregateId: string,
    readonly payload: { reason: string },
  ) {
    super();
  }
}

export class BookingCompletedEvent extends DomainEvent {
  readonly eventType = 'booking.completed';

  constructor(
    readonly aggregateId: string,
    readonly payload: { hostId: string; payoutMinor: number; currency: string },
  ) {
    super();
  }
}

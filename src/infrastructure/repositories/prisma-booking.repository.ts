import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookingRepository } from '../../domain/repositories/booking.repository';
import {
  Booking,
  BookingStatus,
} from '../../domain/entities/booking.aggregate';
import { BookingPeriod } from '../../domain/value-objects/booking-period.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { DomainEvent } from '../../domain/events/domain-event.base';
import { ConcurrencyError } from '../../domain/errors/concurrency.error';
import { OverlappingBookingError } from '../../domain/errors/overlapping-booking.error';

const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.Requested,
  BookingStatus.Confirmed,
  BookingStatus.Active,
];

const OVERLAP_CONSTRAINT_NAME = 'no_overlapping_active_bookings';

function isOverlapConstraintViolation(error: unknown): boolean {
  // Prisma has no typed model for an EXCLUDE constraint (it only knows
  // @@unique), so a violation surfaces as an untyped
  // PrismaClientUnknownRequestError wrapping the raw Postgres error
  // (SQLSTATE 23P01) -- matching on the constraint name in the message
  // is the only reliable way to distinguish it from any other DB error.
  return (
    error instanceof Error && error.message.includes(OVERLAP_CONSTRAINT_NAME)
  );
}

function outboxRowsFor(
  events: DomainEvent[],
): Prisma.OutboxMessageCreateManyInput[] {
  return events.map((event) => ({
    id: event.eventId,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
  }));
}

@Injectable()
export class PrismaBookingRepository implements BookingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Booking | null> {
    const row = await this.prisma.booking.findUnique({ where: { id } });
    if (!row) return null;

    return Booking.reconstitute({
      id: row.id,
      vehicleId: row.vehicleId,
      hostId: row.hostId,
      renterId: row.renterId,
      period: BookingPeriod.of(row.periodStart, row.periodEnd),
      totalPrice: Money.of(row.totalPriceMinor, row.currency),
      status: row.status as BookingStatus,
      cancellationReason: row.cancellationReason,
      version: row.version,
    });
  }

  async hasOverlappingActiveBooking(
    vehicleId: string,
    period: BookingPeriod,
    excludingBookingId?: string,
  ): Promise<boolean> {
    const count = await this.prisma.booking.count({
      where: {
        vehicleId,
        status: { in: ACTIVE_STATUSES },
        id: excludingBookingId ? { not: excludingBookingId } : undefined,
        periodStart: { lt: period.end },
        periodEnd: { gt: period.start },
      },
    });

    return count > 0;
  }

  async create(booking: Booking): Promise<void> {
    const events = booking.pullDomainEvents();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.booking.create({
          data: {
            id: booking.id,
            vehicleId: booking.vehicleId,
            hostId: booking.hostId,
            renterId: booking.renterId,
            periodStart: booking.period.start,
            periodEnd: booking.period.end,
            totalPriceMinor: booking.totalPrice.amountMinor,
            currency: booking.totalPrice.currency,
            status: booking.getStatus(),
            version: 0,
          },
        });

        if (events.length > 0) {
          await tx.outboxMessage.createMany({ data: outboxRowsFor(events) });
        }
      });
    } catch (error) {
      // Backstop for the same race the application-level overlap check
      // (in the command handler) can't close by itself: two requests on
      // two DB connections can both pass that check before either commits.
      // The exclusion constraint added in the migration is what actually
      // makes overlap impossible to persist.
      if (isOverlapConstraintViolation(error)) {
        throw new OverlappingBookingError(booking.vehicleId);
      }
      throw error;
    }
  }

  async save(booking: Booking): Promise<void> {
    const events = booking.pullDomainEvents();

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.booking.updateMany({
        where: { id: booking.id, version: booking.version },
        data: {
          status: booking.getStatus(),
          cancellationReason: booking.getCancellationReason(),
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw new ConcurrencyError(booking.id, booking.version);
      }

      if (events.length > 0) {
        await tx.outboxMessage.createMany({ data: outboxRowsFor(events) });
      }
    });
  }
}

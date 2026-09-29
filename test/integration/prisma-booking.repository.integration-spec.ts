import { PrismaClient } from '@prisma/client';
import { startTestDatabase, stopTestDatabase } from './setup';
import { PrismaBookingRepository } from '../../src/infrastructure/repositories/prisma-booking.repository';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { Booking } from '../../src/domain/entities/booking.aggregate';
import { BookingPeriod } from '../../src/domain/value-objects/booking-period.vo';
import { Money } from '../../src/domain/value-objects/money.vo';
import { ConcurrencyError } from '../../src/domain/errors/concurrency.error';
import { OverlappingBookingError } from '../../src/domain/errors/overlapping-booking.error';

jest.setTimeout(120_000);

let prisma: PrismaClient;
let repo: PrismaBookingRepository;
let vehicleId: string;

beforeAll(async () => {
  prisma = await startTestDatabase();
  repo = new PrismaBookingRepository(prisma as unknown as PrismaService);
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await prisma.processedInboxMessage.deleteMany();
  await prisma.payoutInitiation.deleteMany();
  await prisma.outboxMessage.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.vehicle.deleteMany();

  const vehicle = await prisma.vehicle.create({
    data: {
      hostId: 'host-1',
      make: 'Toyota',
      model: 'Corolla',
      dailyRateMinor: 500_000,
      currency: 'NGN',
    },
  });
  vehicleId = vehicle.id;
});

function newBooking(
  overrides: Partial<{ start: Date; end: Date; renterId: string }> = {},
) {
  return Booking.request({
    vehicleId,
    hostId: 'host-1',
    renterId: overrides.renterId ?? 'renter-1',
    period: BookingPeriod.of(
      overrides.start ?? new Date('2027-03-01T09:00Z'),
      overrides.end ?? new Date('2027-03-03T09:00Z'),
    ),
    totalPrice: Money.of(1_000_000, 'NGN'),
  });
}

describe('PrismaBookingRepository (real Postgres)', () => {
  it('create() persists the booking and its outbox events in the same transaction', async () => {
    const booking = newBooking();
    await repo.create(booking);

    const row = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(row).not.toBeNull();
    expect(row!.status).toBe('REQUESTED');

    const outboxRows = await prisma.outboxMessage.findMany({
      where: { aggregateId: booking.id },
    });
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].eventType).toBe('booking.requested');
  });

  it('findById reconstitutes a booking that behaves identically to the original', async () => {
    const booking = newBooking();
    await repo.create(booking);

    const loaded = await repo.findById(booking.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.getStatus()).toBe('REQUESTED');
    expect(loaded!.totalPrice.amountMinor).toBe(1_000_000);

    loaded!.confirm();
    await repo.save(loaded!);

    const row = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(row!.status).toBe('CONFIRMED');
    expect(row!.version).toBe(1);
  });

  it('save() rejects a stale version with ConcurrencyError instead of silently overwriting', async () => {
    const booking = newBooking();
    await repo.create(booking);

    const first = await repo.findById(booking.id);
    const second = await repo.findById(booking.id);

    first!.confirm();
    await repo.save(first!); // version 0 -> 1, succeeds

    second!.confirm(); // still holds the stale version (0) in memory
    await expect(repo.save(second!)).rejects.toThrow(ConcurrencyError);
  });

  it('two concurrent saves on the same stale version: exactly one wins, real DB connections', async () => {
    const booking = newBooking();
    await repo.create(booking);

    const loadedA = (await repo.findById(booking.id))!;
    const loadedB = (await repo.findById(booking.id))!;
    loadedA.confirm();
    loadedB.cancel('renter changed plans');

    const results = await Promise.allSettled([
      repo.save(loadedA),
      repo.save(loadedB),
    ]);
    const outcomes = results.map((r) => r.status);

    expect(outcomes.filter((s) => s === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((s) => s === 'rejected')).toHaveLength(1);

    const row = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(row!.version).toBe(1); // only one update landed
  });

  it('the DB exclusion constraint rejects an overlapping booking even without the app-level check', async () => {
    const first = newBooking({
      start: new Date('2027-04-01T09:00Z'),
      end: new Date('2027-04-03T09:00Z'),
    });
    await repo.create(first);

    const overlapping = newBooking({
      start: new Date('2027-04-02T09:00Z'),
      end: new Date('2027-04-04T09:00Z'),
      renterId: 'renter-2',
    });

    // Bypasses the application-level overlap check on purpose -- this
    // proves the DB constraint is the one actually doing the work, not
    // just backing up a check that would have caught it anyway.
    await expect(repo.create(overlapping)).rejects.toThrow(
      OverlappingBookingError,
    );

    const persisted = await prisma.booking.count({ where: { vehicleId } });
    expect(persisted).toBe(1);
  });

  it('the exclusion constraint allows rebooking a slot that was cancelled', async () => {
    const first = newBooking({
      start: new Date('2027-05-01T09:00Z'),
      end: new Date('2027-05-03T09:00Z'),
    });
    await repo.create(first);

    const loaded = (await repo.findById(first.id))!;
    loaded.cancel('renter cancelled');
    await repo.save(loaded);

    const second = newBooking({
      start: new Date('2027-05-01T09:00Z'),
      end: new Date('2027-05-03T09:00Z'),
      renterId: 'renter-2',
    });

    await expect(repo.create(second)).resolves.not.toThrow();
  });

  it('does not consider a different vehicle for the same time range an overlap', async () => {
    const otherVehicle = await prisma.vehicle.create({
      data: {
        hostId: 'host-2',
        make: 'Honda',
        model: 'Civic',
        dailyRateMinor: 400_000,
        currency: 'NGN',
      },
    });

    const first = newBooking({
      start: new Date('2027-06-01T09:00Z'),
      end: new Date('2027-06-03T09:00Z'),
    });
    await repo.create(first);

    const sameTimeDifferentVehicle = Booking.request({
      vehicleId: otherVehicle.id,
      hostId: 'host-2',
      renterId: 'renter-2',
      period: BookingPeriod.of(
        new Date('2027-06-01T09:00Z'),
        new Date('2027-06-03T09:00Z'),
      ),
      totalPrice: Money.of(800_000, 'NGN'),
    });

    await expect(repo.create(sameTimeDifferentVehicle)).resolves.not.toThrow();
  });
});

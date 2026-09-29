import { RequestBookingHandler } from './request-booking.handler';
import { RequestBookingCommand } from './request-booking.command';
import { Booking } from '../../domain/entities/booking.aggregate';
import { BookingRepository } from '../../domain/repositories/booking.repository';
import {
  VehicleRecord,
  VehicleRepository,
} from '../../domain/repositories/vehicle.repository';
import { VehicleNotFoundError } from '../../domain/errors/vehicle-not-found.error';
import { OverlappingBookingError } from '../../domain/errors/overlapping-booking.error';

/**
 * These fakes are the whole point of the port/adapter split: the command
 * handler is tested with zero Prisma, zero Postgres, zero network -- just
 * plain objects implementing the domain's repository interfaces.
 */
class FakeBookingRepository implements BookingRepository {
  public created: Booking[] = [];
  public overlapResult = false;

  async findById(): Promise<Booking | null> {
    return null;
  }

  async hasOverlappingActiveBooking(): Promise<boolean> {
    return this.overlapResult;
  }

  async create(booking: Booking): Promise<void> {
    this.created.push(booking);
  }

  async save(): Promise<void> {
    throw new Error('not used in this test');
  }
}

class FakeVehicleRepository implements VehicleRepository {
  constructor(private readonly vehicle: VehicleRecord | null) {}

  async findById(): Promise<VehicleRecord | null> {
    return this.vehicle;
  }
}

describe('RequestBookingHandler', () => {
  const vehicle: VehicleRecord = {
    id: 'vehicle-1',
    hostId: 'host-1',
    dailyRateMinor: 500_000,
    currency: 'NGN',
  };

  it('creates a booking priced by whole days at the vehicle daily rate', async () => {
    const bookings = new FakeBookingRepository();
    const handler = new RequestBookingHandler(
      bookings,
      new FakeVehicleRepository(vehicle),
    );

    const id = await handler.execute(
      new RequestBookingCommand(
        'vehicle-1',
        'renter-1',
        new Date('2027-01-01T09:00'),
        new Date('2027-01-03T09:00'),
      ),
    );

    expect(id).toBe(bookings.created[0].id);
    expect(bookings.created[0].totalPrice.amountMinor).toBe(1_000_000); // 2 days
  });

  it('throws VehicleNotFoundError when the vehicle does not exist', async () => {
    const handler = new RequestBookingHandler(
      new FakeBookingRepository(),
      new FakeVehicleRepository(null),
    );

    await expect(
      handler.execute(
        new RequestBookingCommand(
          'missing',
          'renter-1',
          new Date('2027-01-01'),
          new Date('2027-01-02'),
        ),
      ),
    ).rejects.toThrow(VehicleNotFoundError);
  });

  it('throws OverlappingBookingError without creating anything when the vehicle is already booked', async () => {
    const bookings = new FakeBookingRepository();
    bookings.overlapResult = true;
    const handler = new RequestBookingHandler(
      bookings,
      new FakeVehicleRepository(vehicle),
    );

    await expect(
      handler.execute(
        new RequestBookingCommand(
          'vehicle-1',
          'renter-1',
          new Date('2027-01-01'),
          new Date('2027-01-02'),
        ),
      ),
    ).rejects.toThrow(OverlappingBookingError);

    expect(bookings.created).toHaveLength(0);
  });

  it('rounds a partial day up to a full day of pricing', async () => {
    const bookings = new FakeBookingRepository();
    const handler = new RequestBookingHandler(
      bookings,
      new FakeVehicleRepository(vehicle),
    );

    await handler.execute(
      new RequestBookingCommand(
        'vehicle-1',
        'renter-1',
        new Date('2027-01-01T09:00'),
        new Date('2027-01-01T15:00'),
      ),
    );

    expect(bookings.created[0].totalPrice.amountMinor).toBe(500_000); // 1 day, rounded up
  });
});

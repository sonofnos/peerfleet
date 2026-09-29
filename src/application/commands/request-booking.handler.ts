import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RequestBookingCommand } from './request-booking.command';
import { Booking } from '../../domain/entities/booking.aggregate';
import { BookingPeriod } from '../../domain/value-objects/booking-period.vo';
import { Money } from '../../domain/value-objects/money.vo';
import {
  BOOKING_REPOSITORY,
  BookingRepository,
} from '../../domain/repositories/booking.repository';
import {
  VEHICLE_REPOSITORY,
  VehicleRepository,
} from '../../domain/repositories/vehicle.repository';
import { VehicleNotFoundError } from '../../domain/errors/vehicle-not-found.error';
import { OverlappingBookingError } from '../../domain/errors/overlapping-booking.error';

@CommandHandler(RequestBookingCommand)
export class RequestBookingHandler implements ICommandHandler<
  RequestBookingCommand,
  string
> {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
  ) {}

  async execute(command: RequestBookingCommand): Promise<string> {
    const vehicle = await this.vehicles.findById(command.vehicleId);
    if (!vehicle) {
      throw new VehicleNotFoundError(command.vehicleId);
    }

    const period = BookingPeriod.of(command.start, command.end);

    // Application-level half of double-booking prevention: check before
    // insert. The DB-level exclusion constraint (infra layer) is the
    // backstop that closes the race this check alone can't -- two requests
    // on two connections can both pass this check before either commits.
    const overlapping = await this.bookings.hasOverlappingActiveBooking(
      command.vehicleId,
      period,
    );
    if (overlapping) {
      throw new OverlappingBookingError(command.vehicleId);
    }

    const dailyRate = Money.of(vehicle.dailyRateMinor, vehicle.currency);
    const days = Math.max(1, Math.ceil(period.durationHours() / 24));
    const totalPrice = dailyRate.multiply(days);

    const booking = Booking.request({
      vehicleId: command.vehicleId,
      hostId: vehicle.hostId,
      renterId: command.renterId,
      period,
      totalPrice,
    });

    await this.bookings.create(booking);

    return booking.id;
  }
}

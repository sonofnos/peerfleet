import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ConfirmBookingCommand } from './confirm-booking.command';
import {
  BOOKING_REPOSITORY,
  BookingRepository,
} from '../../domain/repositories/booking.repository';
import { BookingNotFoundError } from '../../domain/errors/booking-not-found.error';
import { retryOnConflict } from '../retry-on-conflict';

@CommandHandler(ConfirmBookingCommand)
export class ConfirmBookingHandler implements ICommandHandler<
  ConfirmBookingCommand,
  void
> {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
  ) {}

  async execute(command: ConfirmBookingCommand): Promise<void> {
    await retryOnConflict(async () => {
      const booking = await this.bookings.findById(command.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(command.bookingId);
      }

      booking.confirm();
      await this.bookings.save(booking);
    });
  }
}

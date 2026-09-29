import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CancelBookingCommand } from './cancel-booking.command';
import {
  BOOKING_REPOSITORY,
  BookingRepository,
} from '../../domain/repositories/booking.repository';
import { BookingNotFoundError } from '../../domain/errors/booking-not-found.error';
import { retryOnConflict } from '../retry-on-conflict';

@CommandHandler(CancelBookingCommand)
export class CancelBookingHandler implements ICommandHandler<
  CancelBookingCommand,
  void
> {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
  ) {}

  async execute(command: CancelBookingCommand): Promise<void> {
    await retryOnConflict(async () => {
      const booking = await this.bookings.findById(command.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(command.bookingId);
      }

      booking.cancel(command.reason);
      await this.bookings.save(booking);
    });
  }
}

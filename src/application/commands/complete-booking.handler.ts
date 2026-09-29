import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CompleteBookingCommand } from './complete-booking.command';
import {
  BOOKING_REPOSITORY,
  BookingRepository,
} from '../../domain/repositories/booking.repository';
import { BookingNotFoundError } from '../../domain/errors/booking-not-found.error';
import { retryOnConflict } from '../retry-on-conflict';

@CommandHandler(CompleteBookingCommand)
export class CompleteBookingHandler implements ICommandHandler<
  CompleteBookingCommand,
  number
> {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
  ) {}

  /** Returns the host's payout in minor units, for the caller to display. */
  async execute(command: CompleteBookingCommand): Promise<number> {
    return retryOnConflict(async () => {
      const booking = await this.bookings.findById(command.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(command.bookingId);
      }

      const payout = booking.complete();
      await this.bookings.save(booking);

      return payout.amountMinor;
    });
  }
}

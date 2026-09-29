import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BookingReadModel, GetBookingQuery } from './get-booking.query';
import {
  BOOKING_READ_REPOSITORY,
  BookingReadRepository,
} from './booking-read.repository';

@QueryHandler(GetBookingQuery)
export class GetBookingHandler implements IQueryHandler<
  GetBookingQuery,
  BookingReadModel | null
> {
  constructor(
    @Inject(BOOKING_READ_REPOSITORY)
    private readonly reads: BookingReadRepository,
  ) {}

  execute(query: GetBookingQuery): Promise<BookingReadModel | null> {
    return this.reads.findById(query.bookingId);
  }
}

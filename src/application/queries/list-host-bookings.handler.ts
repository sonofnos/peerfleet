import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BookingReadModel } from './get-booking.query';
import { ListHostBookingsQuery } from './list-host-bookings.query';
import {
  BOOKING_READ_REPOSITORY,
  BookingReadRepository,
} from './booking-read.repository';

@QueryHandler(ListHostBookingsQuery)
export class ListHostBookingsHandler implements IQueryHandler<
  ListHostBookingsQuery,
  BookingReadModel[]
> {
  constructor(
    @Inject(BOOKING_READ_REPOSITORY)
    private readonly reads: BookingReadRepository,
  ) {}

  execute(query: ListHostBookingsQuery): Promise<BookingReadModel[]> {
    return this.reads.listForHost(query.hostId);
  }
}

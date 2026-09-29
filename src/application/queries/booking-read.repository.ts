import { BookingReadModel } from './get-booking.query';

export const BOOKING_READ_REPOSITORY = Symbol('BOOKING_READ_REPOSITORY');

/**
 * The read side of CQRS: a flat, denormalized shape read directly from
 * storage, with no aggregate reconstruction. The write side (BookingRepository)
 * and read side never share an interface -- that's the "strict" in
 * "strict read/write separation."
 */
export interface BookingReadRepository {
  findById(id: string): Promise<BookingReadModel | null>;
  listForHost(hostId: string): Promise<BookingReadModel[]>;
}

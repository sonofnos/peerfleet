export class BookingNotFoundError extends Error {
  constructor(bookingId: string) {
    super(`Booking ${bookingId} not found`);
  }
}

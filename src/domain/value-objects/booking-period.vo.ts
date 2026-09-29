export class InvalidBookingPeriodError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class BookingPeriod {
  private constructor(
    public readonly start: Date,
    public readonly end: Date,
  ) {
    if (start >= end) {
      throw new InvalidBookingPeriodError(
        'Booking period start must be before its end',
      );
    }
  }

  static of(start: Date, end: Date): BookingPeriod {
    return new BookingPeriod(start, end);
  }

  /** Half-open interval overlap: [start, end) vs [start, end). */
  overlaps(other: BookingPeriod): boolean {
    return this.start < other.end && other.start < this.end;
  }

  durationHours(): number {
    return (this.end.getTime() - this.start.getTime()) / (1000 * 60 * 60);
  }
}

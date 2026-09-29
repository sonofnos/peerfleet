import { BookingPeriod, InvalidBookingPeriodError } from './booking-period.vo';

const d = (s: string) => new Date(s);

describe('BookingPeriod', () => {
  it('rejects a period where start is not before end', () => {
    expect(() => BookingPeriod.of(d('2027-01-02'), d('2027-01-01'))).toThrow(
      InvalidBookingPeriodError,
    );
    expect(() =>
      BookingPeriod.of(d('2027-01-01T10:00'), d('2027-01-01T10:00')),
    ).toThrow(InvalidBookingPeriodError);
  });

  it('detects overlap between two periods sharing time', () => {
    const a = BookingPeriod.of(d('2027-01-01'), d('2027-01-05'));
    const b = BookingPeriod.of(d('2027-01-03'), d('2027-01-07'));
    expect(a.overlaps(b)).toBe(true);
    expect(b.overlaps(a)).toBe(true);
  });

  it('does not consider back-to-back periods overlapping (half-open interval)', () => {
    const a = BookingPeriod.of(d('2027-01-01'), d('2027-01-05'));
    const b = BookingPeriod.of(d('2027-01-05'), d('2027-01-09'));
    expect(a.overlaps(b)).toBe(false);
  });

  it('does not consider disjoint periods overlapping', () => {
    const a = BookingPeriod.of(d('2027-01-01'), d('2027-01-02'));
    const b = BookingPeriod.of(d('2027-02-01'), d('2027-02-02'));
    expect(a.overlaps(b)).toBe(false);
  });

  it('computes duration in hours', () => {
    const period = BookingPeriod.of(
      d('2027-01-01T00:00'),
      d('2027-01-02T12:00'),
    );
    expect(period.durationHours()).toBe(36);
  });
});

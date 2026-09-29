export class OverlappingBookingError extends Error {
  constructor(vehicleId: string) {
    super(
      `Vehicle ${vehicleId} already has an active booking for an overlapping period`,
    );
  }
}

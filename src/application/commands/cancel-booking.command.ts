export class CancelBookingCommand {
  constructor(
    readonly bookingId: string,
    readonly reason: string,
  ) {}
}

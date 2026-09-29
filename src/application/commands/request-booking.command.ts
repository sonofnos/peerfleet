export class RequestBookingCommand {
  constructor(
    readonly vehicleId: string,
    readonly renterId: string,
    readonly start: Date,
    readonly end: Date,
  ) {}
}

export class GetBookingQuery {
  constructor(readonly bookingId: string) {}
}

export interface BookingReadModel {
  id: string;
  vehicleId: string;
  hostId: string;
  renterId: string;
  periodStart: Date;
  periodEnd: Date;
  totalPriceMinor: number;
  currency: string;
  status: string;
  cancellationReason: string | null;
}

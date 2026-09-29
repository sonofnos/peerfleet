import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingReadRepository } from '../../application/queries/booking-read.repository';
import { BookingReadModel } from '../../application/queries/get-booking.query';

@Injectable()
export class PrismaBookingReadRepository implements BookingReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<BookingReadModel | null> {
    const row = await this.prisma.booking.findUnique({ where: { id } });
    return row ? toReadModel(row) : null;
  }

  async listForHost(hostId: string): Promise<BookingReadModel[]> {
    const rows = await this.prisma.booking.findMany({
      where: { hostId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toReadModel);
  }
}

function toReadModel(row: {
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
}): BookingReadModel {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    hostId: row.hostId,
    renterId: row.renterId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    totalPriceMinor: row.totalPriceMinor,
    currency: row.currency,
    status: row.status,
    cancellationReason: row.cancellationReason,
  };
}

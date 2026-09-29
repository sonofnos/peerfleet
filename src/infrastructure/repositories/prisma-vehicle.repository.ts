import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  VehicleRecord,
  VehicleRepository,
} from '../../domain/repositories/vehicle.repository';

@Injectable()
export class PrismaVehicleRepository implements VehicleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<VehicleRecord | null> {
    const row = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!row) return null;

    return {
      id: row.id,
      hostId: row.hostId,
      dailyRateMinor: row.dailyRateMinor,
      currency: row.currency,
    };
  }
}

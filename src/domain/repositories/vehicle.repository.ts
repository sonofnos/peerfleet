export const VEHICLE_REPOSITORY = Symbol('VEHICLE_REPOSITORY');

export interface VehicleRecord {
  id: string;
  hostId: string;
  dailyRateMinor: number;
  currency: string;
}

export interface VehicleRepository {
  findById(id: string): Promise<VehicleRecord | null>;
}

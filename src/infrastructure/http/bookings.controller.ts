import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { RequestBookingCommand } from '../../application/commands/request-booking.command';
import { ConfirmBookingCommand } from '../../application/commands/confirm-booking.command';
import { CancelBookingCommand } from '../../application/commands/cancel-booking.command';
import { CompleteBookingCommand } from '../../application/commands/complete-booking.command';
import { GetBookingQuery } from '../../application/queries/get-booking.query';
import { ListHostBookingsQuery } from '../../application/queries/list-host-bookings.query';
import { VehicleNotFoundError } from '../../domain/errors/vehicle-not-found.error';
import { OverlappingBookingError } from '../../domain/errors/overlapping-booking.error';
import { BookingNotFoundError } from '../../domain/errors/booking-not-found.error';
import { BookingInvariantError } from '../../domain/errors/booking-invariant.error';
import { InvalidBookingPeriodError } from '../../domain/value-objects/booking-period.vo';

class RequestBookingDto {
  vehicleId!: string;
  renterId!: string;
  start!: string;
  end!: string;
}

class CancelBookingDto {
  reason!: string;
}

@Controller()
export class BookingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('bookings')
  async request(@Body() dto: RequestBookingDto) {
    return this.handle(async () => {
      const id = await this.commandBus.execute(
        new RequestBookingCommand(
          dto.vehicleId,
          dto.renterId,
          new Date(dto.start),
          new Date(dto.end),
        ),
      );
      return { id };
    });
  }

  @Post('bookings/:id/confirm')
  async confirm(@Param('id') id: string) {
    return this.handle(async () => {
      await this.commandBus.execute(new ConfirmBookingCommand(id));
      return { status: 'confirmed' };
    });
  }

  @Post('bookings/:id/cancel')
  async cancel(@Param('id') id: string, @Body() dto: CancelBookingDto) {
    return this.handle(async () => {
      await this.commandBus.execute(new CancelBookingCommand(id, dto.reason));
      return { status: 'cancelled' };
    });
  }

  @Post('bookings/:id/complete')
  async complete(@Param('id') id: string) {
    return this.handle(async () => {
      const payoutMinor = await this.commandBus.execute(
        new CompleteBookingCommand(id),
      );
      return { status: 'completed', payoutMinor };
    });
  }

  @Get('bookings/:id')
  async getOne(@Param('id') id: string) {
    const booking = await this.queryBus.execute(new GetBookingQuery(id));
    if (!booking)
      throw new HttpException('Booking not found', HttpStatus.NOT_FOUND);
    return booking;
  }

  @Get('hosts/:hostId/bookings')
  listForHost(@Param('hostId') hostId: string) {
    return this.queryBus.execute(new ListHostBookingsQuery(hostId));
  }

  private async handle<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (
        error instanceof VehicleNotFoundError ||
        error instanceof BookingNotFoundError
      ) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      if (error instanceof OverlappingBookingError) {
        throw new HttpException(error.message, HttpStatus.CONFLICT);
      }
      if (
        error instanceof BookingInvariantError ||
        error instanceof InvalidBookingPeriodError
      ) {
        throw new HttpException(error.message, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      throw error;
    }
  }
}

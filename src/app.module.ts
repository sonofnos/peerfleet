import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { BookingsController } from './infrastructure/http/bookings.controller';
import {
  RabbitMqService,
  RABBITMQ_URL,
} from './infrastructure/messaging/rabbitmq.service';
import { OutboxPublisherService } from './infrastructure/messaging/outbox-publisher.service';
import { HostPayoutListener } from './infrastructure/messaging/host-payout.listener';
import { PrismaBookingRepository } from './infrastructure/repositories/prisma-booking.repository';
import { PrismaBookingReadRepository } from './infrastructure/repositories/prisma-booking-read.repository';
import { PrismaVehicleRepository } from './infrastructure/repositories/prisma-vehicle.repository';
import { BOOKING_REPOSITORY } from './domain/repositories/booking.repository';
import { VEHICLE_REPOSITORY } from './domain/repositories/vehicle.repository';
import { BOOKING_READ_REPOSITORY } from './application/queries/booking-read.repository';
import { RequestBookingHandler } from './application/commands/request-booking.handler';
import { ConfirmBookingHandler } from './application/commands/confirm-booking.handler';
import { CancelBookingHandler } from './application/commands/cancel-booking.handler';
import { CompleteBookingHandler } from './application/commands/complete-booking.handler';
import { GetBookingHandler } from './application/queries/get-booking.handler';
import { ListHostBookingsHandler } from './application/queries/list-host-bookings.handler';

const commandHandlers = [
  RequestBookingHandler,
  ConfirmBookingHandler,
  CancelBookingHandler,
  CompleteBookingHandler,
];

const queryHandlers = [GetBookingHandler, ListHostBookingsHandler];

@Module({
  imports: [CqrsModule],
  controllers: [BookingsController],
  providers: [
    PrismaService,
    {
      provide: RABBITMQ_URL,
      useValue: process.env.RABBITMQ_URL ?? 'amqp://localhost:5672',
    },
    RabbitMqService,
    OutboxPublisherService,
    HostPayoutListener,
    { provide: BOOKING_REPOSITORY, useClass: PrismaBookingRepository },
    { provide: VEHICLE_REPOSITORY, useClass: PrismaVehicleRepository },
    { provide: BOOKING_READ_REPOSITORY, useClass: PrismaBookingReadRepository },
    ...commandHandlers,
    ...queryHandlers,
  ],
})
export class AppModule {}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMqService } from './rabbitmq.service';

const QUEUE = 'peerfleet.host-payouts';
const CONSUMER_NAME = 'host-payout-listener';

interface BookingCompletedPayload {
  hostId: string;
  payoutMinor: number;
  currency: string;
}

/**
 * The inbox side of the pattern: RabbitMQ guarantees at-least-once
 * delivery, so this listener can and will see the same message more than
 * once (a redelivery after a slow ack, a broker restart). Idempotency
 * comes from a unique (messageId, consumer) row inserted in the SAME
 * transaction as the side effect -- if the insert conflicts, the message
 * was already handled and this is a no-op, not a double payout.
 */
@Injectable()
export class HostPayoutListener implements OnModuleInit {
  private readonly logger = new Logger(HostPayoutListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMqService,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.assertAndBindQueue(QUEUE, ['booking.completed']);
    await this.rabbitmq.consume(QUEUE, (payload, messageId) =>
      this.handle(payload, messageId),
    );
  }

  async handle(
    payload: Record<string, unknown>,
    messageId: string,
  ): Promise<void> {
    await this.processOnce(
      messageId,
      payload['payload'] as BookingCompletedPayload,
      payload['aggregateId'] as string,
    );
  }

  async processOnce(
    messageId: string,
    event: BookingCompletedPayload,
    bookingId: string,
  ): Promise<'processed' | 'duplicate'> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.processedInboxMessage.create({
          data: { messageId, consumer: CONSUMER_NAME },
        });

        await tx.payoutInitiation.create({
          data: {
            bookingId,
            hostId: event.hostId,
            amountMinor: event.payoutMinor,
            currency: event.currency,
          },
        });
      });

      return 'processed';
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        this.logger.debug(
          `Message ${messageId} already processed by ${CONSUMER_NAME}, skipping`,
        );
        return 'duplicate';
      }
      throw error;
    }
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

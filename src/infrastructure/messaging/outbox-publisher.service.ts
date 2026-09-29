import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMqService } from './rabbitmq.service';

/**
 * The other half of the outbox pattern: the command handler/repository
 * wrote the event to the outbox table in the same transaction as the
 * state change, so it's guaranteed to be there even if the process
 * crashes right after committing. This poller is what actually gets it
 * onto the broker -- at-least-once, since a crash between publish and
 * marking published just means it's redelivered next poll.
 */
@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMqService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.publishPendingOnce().catch((err) =>
        this.logger.error('Outbox publish failed', err),
      );
    }, 2000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Publishes every currently-unpublished outbox row once. Exposed
   * separately from the interval so tests can call it deterministically
   * instead of racing a timer. */
  async publishPendingOnce(): Promise<number> {
    const pending = await this.prisma.outboxMessage.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    for (const message of pending) {
      // message.payload is already the full serialized domain event
      // (eventId, aggregateId, eventType, and its own payload sub-object)
      // -- publish it as-is rather than wrapping it in another envelope.
      await this.rabbitmq.publish(
        message.eventType,
        message.payload as Record<string, unknown>,
      );

      await this.prisma.outboxMessage.update({
        where: { id: message.id },
        data: { publishedAt: new Date() },
      });
    }

    return pending.length;
  }
}

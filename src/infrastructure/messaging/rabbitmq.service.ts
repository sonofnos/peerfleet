import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as amqp from 'amqp-connection-manager';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';

export const RABBITMQ_URL = Symbol('RABBITMQ_URL');

export const EVENTS_EXCHANGE = 'peerfleet.events';

@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private connection: amqp.AmqpConnectionManager;
  private channel: ChannelWrapper;

  constructor(@Inject(RABBITMQ_URL) private readonly url: string) {
    this.connection = amqp.connect([this.url]);
    this.channel = this.connection.createChannel({
      setup: (channel: ConfirmChannel) =>
        channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true }),
    });
  }

  async onModuleInit() {
    await this.channel.waitForConnect();
  }

  async onModuleDestroy() {
    await this.channel.close();
    await this.connection.close();
  }

  async publish(
    routingKey: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    await this.channel.publish(
      EVENTS_EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        messageId: message['eventId'] as string | undefined,
      },
    );
  }

  async assertAndBindQueue(
    queue: string,
    routingKeys: string[],
  ): Promise<void> {
    await this.channel.addSetup(async (channel: ConfirmChannel) => {
      await channel.assertQueue(queue, { durable: true });
      for (const key of routingKeys) {
        await channel.bindQueue(queue, EVENTS_EXCHANGE, key);
      }
    });
  }

  async consume(
    queue: string,
    handler: (
      payload: Record<string, unknown>,
      messageId: string,
    ) => Promise<void>,
  ): Promise<void> {
    await this.channel.addSetup(async (channel: ConfirmChannel) => {
      await channel.consume(queue, async (msg) => {
        if (!msg) return;
        try {
          const payload = JSON.parse(msg.content.toString());
          const messageId =
            (msg.properties.messageId as string) ?? payload.eventId;
          await handler(payload, messageId);
          channel.ack(msg);
        } catch (error) {
          // Requeueing on every failure turns one bad message into an
          // infinite redelivery storm if the failure is deterministic
          // (a bug, a malformed payload) rather than transient. Drop it
          // instead -- a real deployment would route this to a dead-letter
          // queue for inspection rather than silently discard it.
          console.error(
            `Failed to process message ${msg.properties.messageId} from ${queue}`,
            error,
          );
          channel.nack(msg, false, false);
        }
      });
    });
  }
}

import { PrismaClient } from '@prisma/client';
import { startTestDatabase, stopTestDatabase } from './setup';
import { HostPayoutListener } from '../../src/infrastructure/messaging/host-payout.listener';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';

jest.setTimeout(120_000);

let prisma: PrismaClient;
let listener: HostPayoutListener;

beforeAll(async () => {
  prisma = await startTestDatabase();
  // The listener only needs Prisma for this test -- RabbitMqService is
  // never called by processOnce(), which is the method under test here.
  listener = new HostPayoutListener(
    prisma as unknown as PrismaService,
    undefined as never,
  );
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await prisma.processedInboxMessage.deleteMany();
  await prisma.payoutInitiation.deleteMany();
});

describe('HostPayoutListener (real Postgres)', () => {
  it('processes a booking.completed event exactly once', async () => {
    const result = await listener.processOnce(
      'msg-1',
      { hostId: 'host-1', payoutMinor: 85_000, currency: 'NGN' },
      'booking-1',
    );

    expect(result).toBe('processed');

    const payouts = await prisma.payoutInitiation.findMany({
      where: { bookingId: 'booking-1' },
    });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amountMinor).toBe(85_000);
  });

  it('is idempotent when the same message is redelivered -- the real RabbitMQ at-least-once guarantee', async () => {
    const event = { hostId: 'host-1', payoutMinor: 85_000, currency: 'NGN' };

    const first = await listener.processOnce('msg-2', event, 'booking-2');
    const redelivered = await listener.processOnce('msg-2', event, 'booking-2');

    expect(first).toBe('processed');
    expect(redelivered).toBe('duplicate');

    const payouts = await prisma.payoutInitiation.findMany({
      where: { bookingId: 'booking-2' },
    });
    expect(payouts).toHaveLength(1); // not two, despite two calls
  });

  it('ten concurrent redeliveries of the same message still produce exactly one payout', async () => {
    const event = { hostId: 'host-1', payoutMinor: 85_000, currency: 'NGN' };

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        listener.processOnce('msg-3', event, 'booking-3'),
      ),
    );

    expect(results.filter((r) => r === 'processed')).toHaveLength(1);
    expect(results.filter((r) => r === 'duplicate')).toHaveLength(9);

    const payouts = await prisma.payoutInitiation.findMany({
      where: { bookingId: 'booking-3' },
    });
    expect(payouts).toHaveLength(1);
  });

  it('different consumers may independently process the same message id', async () => {
    // Not exercised by HostPayoutListener directly, but proves the schema
    // decision: (messageId, consumer) is the idempotency key, not messageId
    // alone -- a second consumer type reacting to the same event is a
    // separate concern, not a duplicate.
    await prisma.processedInboxMessage.create({
      data: { messageId: 'msg-4', consumer: 'host-payout-listener' },
    });

    await expect(
      prisma.processedInboxMessage.create({
        data: { messageId: 'msg-4', consumer: 'analytics-listener' },
      }),
    ).resolves.toBeDefined();
  });
});

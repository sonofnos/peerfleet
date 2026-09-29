# peerfleet

A peer-to-peer vehicle rental booking service: NestJS, Prisma/PostgreSQL,
RabbitMQ, built as Domain-Driven Design with CQRS and Clean Architecture
layering (`domain/` → `application/` → `infrastructure/`, dependencies
only ever point inward).

## Why this exists

Built to demonstrate, with real code and real tests rather than a resume
line, the specific stack and patterns a backend role asked for: NestJS +
Prisma, message-broker-driven async workflows with Outbox/Inbox
idempotency, DDD tactical patterns, CQRS, and the distributed-systems
problems that actually show up once two requests hit the same row at the
same time.

## Architecture

- **`domain/`** — the `Booking` aggregate (an aggregate root whose `status`
  can only change through methods that enforce invariants and record
  domain events), `Money` and `BookingPeriod` value objects, repository
  *interfaces* (ports). No NestJS, no Prisma, no framework import anywhere
  in this folder — it's plain TypeScript, and the unit tests prove it by
  testing all of it with zero infrastructure running.
- **`application/`** — CQRS command and query handlers (`@nestjs/cqrs`),
  each depending only on the domain's repository interfaces via DI tokens.
  Commands and queries never share a repository interface — that's the
  "strict" in strict read/write separation.
- **`infrastructure/`** — Prisma repository implementations, the RabbitMQ
  client, the outbox publisher and inbox listener, the HTTP controller.
  Everything that talks to the outside world lives here, and nothing above
  this layer knows it exists.

## Two real distributed-systems problems, closed two ways each

**Double-booking.** `RequestBookingHandler` checks for an overlapping
active booking before inserting — but two requests on two different DB
connections can both pass that check before either commits. The backstop
is a Postgres `EXCLUDE USING gist` constraint on `(vehicleId, tsrange(periodStart, periodEnd))`
(`prisma/migrations/..._no_overlapping_bookings`), scoped to active
bookings so a cancelled slot can be rebooked. `prisma-booking.repository.integration-spec.ts`
proves the constraint itself does the work by bypassing the application
check entirely.

**Lost updates.** Every `Booking` row carries a `version` column.
`save()` does `UPDATE ... WHERE id = ? AND version = ?`; if another
process already moved the version, zero rows update and a `ConcurrencyError`
is thrown instead of silently overwriting a concurrent change. Command
handlers wrap their load-mutate-save cycle in a bounded retry
(`retryOnConflict`). The integration suite proves this with two real
concurrent saves on two real DB connections — exactly one wins.

## Outbox → RabbitMQ → Inbox, all the way through

A domain event (`BookingRequestedEvent`, `BookingCompletedEvent`, ...) is
written to an `outbox_messages` row in the *same transaction* as the
aggregate's state change — so the event is guaranteed to exist even if the
process crashes immediately after committing. `OutboxPublisherService`
polls unpublished rows and publishes them to a RabbitMQ topic exchange,
marking each published only after a successful publish (at-least-once,
not exactly-once — a crash between those two steps means a redelivery,
not a loss).

`HostPayoutListener` consumes `booking.completed` and is the inbox side:
RabbitMQ *will* redeliver a message more than once (a slow ack, a broker
restart), so idempotency comes from a unique `(messageId, consumer)` row
inserted in the same transaction as the payout side effect — not a
uniqueness *check* beforehand, which would just be another race. Verified
manually end-to-end (real booking → real RabbitMQ → real payout row) and
under test with ten concurrent redeliveries of the same message producing
exactly one payout.

## Running it

```
npm install
docker run -d --name peerfleet-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=peerfleet_dev -p 5440:5432 postgres:16
docker run -d --name peerfleet-rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
cp .env.example .env
npx prisma migrate deploy
npm run start:dev
```

## Tests

```
npm test               # 32 unit examples -- domain and application layers, zero infrastructure
npm run test:integration  # 11 examples against a real Postgres (Testcontainers), incl. the concurrency proofs above
```

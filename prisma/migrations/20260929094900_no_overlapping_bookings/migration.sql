-- Belt-and-braces against double-booking: even if two requests race past
-- the application-level overlap check (e.g. two app instances, a retried
-- request), Postgres itself refuses to store two active bookings for the
-- same vehicle whose time ranges overlap. Cancelled bookings are excluded
-- from the check so the slot can be rebooked freely.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
ADD CONSTRAINT no_overlapping_active_bookings
EXCLUDE USING gist (
  "vehicleId" WITH =,
  tsrange("periodStart", "periodEnd") WITH &&
) WHERE (status IN ('REQUESTED', 'CONFIRMED', 'ACTIVE'));

-- REHEARSAL ONLY. Not part of the product's migration history.
--
-- The incident this drill rehearses.
--
-- A plausible, well-intentioned migration: denormalise the UTC day a
-- measurement run started onto the row, then enforce one run per project per
-- day. The first three statements are correct and succeed. The fourth asserts
-- something the product's own semantics contradict — Gate 1 requires two runs
-- on one day to remain two distinct runs — so it fails on real data with
-- SQLSTATE 23505.
--
-- Chosen because it is the shape of migration that actually breaks
-- deployments: additive, reviewed, passing on an empty database and on a
-- developer's sparse local copy, and failing only where the data is real.

ALTER TABLE "public"."MeasurementRun" ADD COLUMN "runDay" TEXT;

UPDATE "public"."MeasurementRun" SET "runDay" = to_char("startedAt", 'YYYY-MM-DD');

ALTER TABLE "public"."MeasurementRun" ALTER COLUMN "runDay" SET NOT NULL;

-- The statement that fails.
CREATE UNIQUE INDEX "MeasurementRun_projectId_runDay_key"
    ON "public"."MeasurementRun"("projectId", "runDay");

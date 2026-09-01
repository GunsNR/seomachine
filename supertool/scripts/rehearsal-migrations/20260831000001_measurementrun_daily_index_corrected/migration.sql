-- REHEARSAL ONLY. Not part of the product's migration history.
--
-- The corrective forward-fix.
--
-- The incident did not prove the denormalised day column was a bad idea. It
-- proved the *uniqueness* was: runs are not unique per project per day, and
-- Gate 1 says they must not be. So the fix keeps the intent — an index that
-- makes "this project's runs on this day" cheap — and drops the false claim.
--
-- Written as a new migration rather than an edit to the failed one. The failed
-- migration has already started somewhere; editing it would change a checksum
-- Prisma has recorded and turn one recoverable incident into permanent drift.
--
-- Idempotent by construction. A forward-fix runs against a database whose exact
-- state depends on how far the failed migration got, and an operator applying
-- it under pressure should not have to work that out first.

ALTER TABLE "public"."MeasurementRun" ADD COLUMN IF NOT EXISTS "runDay" TEXT;

UPDATE "public"."MeasurementRun"
   SET "runDay" = to_char("startedAt", 'YYYY-MM-DD')
 WHERE "runDay" IS NULL;

-- Deliberately NOT unique. This is the whole correction.
CREATE INDEX IF NOT EXISTS "MeasurementRun_projectId_runDay_idx"
    ON "public"."MeasurementRun"("projectId", "runDay");

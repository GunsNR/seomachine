-- An atomic per-group, per-day quota counter.
--
-- Hand-written because it backfills: usage already exists on ApiKey rows, and a
-- generated diff would create an empty table, silently handing every tenant a
-- fresh budget for the current day.

CREATE TABLE "public"."ApiQuotaCounter" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "quotaGroupId" TEXT NOT NULL,
    "usageDay" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiQuotaCounter_pkey" PRIMARY KEY ("id")
);

-- The lock. Concurrent admissions for one group and day contend on this index,
-- which is what makes ON CONFLICT DO UPDATE serialize them.
CREATE UNIQUE INDEX "ApiQuotaCounter_orgId_quotaGroupId_usageDay_key"
    ON "public"."ApiQuotaCounter"("orgId", "quotaGroupId", "usageDay");

-- Carry existing usage across, summed per group exactly as the old read-time
-- aggregation did, so nobody's spent budget is forgotten at the cutover.
INSERT INTO "public"."ApiQuotaCounter" ("id", "orgId", "quotaGroupId", "usageDay", "used", "updatedAt")
SELECT gen_random_uuid()::text,
       "orgId",
       "quotaGroupId",
       "usageDay",
       SUM("usageCount"),
       NOW()
  FROM "public"."ApiKey"
 WHERE "usageDay" <> ''
 GROUP BY "orgId", "quotaGroupId", "usageDay";

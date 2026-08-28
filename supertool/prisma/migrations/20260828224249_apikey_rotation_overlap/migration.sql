-- API key rotation with a bounded overlap window.
--
-- Written by hand rather than generated, because two of these columns need a
-- backfill: a generated diff would add them and leave existing rows to be
-- interpreted by application code, which is the thing this migration exists to
-- stop.

-- The owning tenant, copied down from Project. Every quota-group lookup
-- constrains on it, so cross-tenant aggregation is impossible at the query
-- rather than merely unlikely.
ALTER TABLE "public"."ApiKey" ADD COLUMN "orgId" TEXT;
UPDATE "public"."ApiKey" AS k
   SET "orgId" = p."orgId"
  FROM "public"."Project" AS p
 WHERE p."id" = k."projectId";
ALTER TABLE "public"."ApiKey" ALTER COLUMN "orgId" SET NOT NULL;

-- Rotation bookkeeping. All three are legitimately null on a key that has not
-- been rotated, so no backfill is needed.
ALTER TABLE "public"."ApiKey" ADD COLUMN "rotatedAt" TIMESTAMP(3);
ALTER TABLE "public"."ApiKey" ADD COLUMN "overlapExpiresAt" TIMESTAMP(3);
ALTER TABLE "public"."ApiKey" ADD COLUMN "rotatedFromId" TEXT;

-- The quota group.
--
-- Every key that predates rotation is a standalone key, so each becomes its own
-- group keyed by its own id: unique by construction because the id is the
-- primary key, stable because ids never change, and impossible to collide with
-- another tenant's group. The column is then made NOT NULL and constrained
-- non-empty, so there is no falsy value left for application code to special-case.
ALTER TABLE "public"."ApiKey" ADD COLUMN "quotaGroupId" TEXT;
UPDATE "public"."ApiKey" SET "quotaGroupId" = "id" WHERE "quotaGroupId" IS NULL OR "quotaGroupId" = '';
ALTER TABLE "public"."ApiKey" ALTER COLUMN "quotaGroupId" SET NOT NULL;
ALTER TABLE "public"."ApiKey"
  ADD CONSTRAINT "ApiKey_quotaGroupId_not_empty" CHECK ("quotaGroupId" <> '');

-- CreateTable
CREATE TABLE "public"."ApiKeyEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "successorKeyId" TEXT,
    "actorUserId" TEXT,
    "actorRole" TEXT NOT NULL,
    "overlapExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKeyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiKeyEvent_projectId_createdAt_idx" ON "public"."ApiKeyEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiKeyEvent_keyId_idx" ON "public"."ApiKeyEvent"("keyId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_rotatedFromId_key" ON "public"."ApiKey"("rotatedFromId");

-- CreateIndex
CREATE INDEX "ApiKey_orgId_quotaGroupId_idx" ON "public"."ApiKey"("orgId", "quotaGroupId");

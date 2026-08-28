-- AlterTable
ALTER TABLE "public"."ApiKey" ADD COLUMN     "overlapExpiresAt" TIMESTAMP(3),
ADD COLUMN     "quotaGroupId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "rotatedAt" TIMESTAMP(3),
ADD COLUMN     "rotatedFromId" TEXT;

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
CREATE INDEX "ApiKey_quotaGroupId_idx" ON "public"."ApiKey"("quotaGroupId");


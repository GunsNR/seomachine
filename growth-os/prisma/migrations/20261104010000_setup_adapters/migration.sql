-- AlterTable
ALTER TABLE "public"."Destination" ADD COLUMN     "providerAccountId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "public"."Integration" ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "public"."Site" ADD COLUMN     "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "public"."GscRow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "page" TEXT NOT NULL DEFAULT '',
    "query" TEXT NOT NULL DEFAULT '',
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "position" DOUBLE PRECISION,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "importedById" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GscRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GscRow_workspaceId_property_page_idx" ON "public"."GscRow"("workspaceId", "property", "page");

-- CreateIndex
CREATE INDEX "GscRow_workspaceId_importId_idx" ON "public"."GscRow"("workspaceId", "importId");


-- CreateTable
CREATE TABLE "public"."MarketingCost" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingCost_workspaceId_periodStart_idx" ON "public"."MarketingCost"("workspaceId", "periodStart");

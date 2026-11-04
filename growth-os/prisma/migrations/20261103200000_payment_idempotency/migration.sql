-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_workspaceId_idempotencyKey_key" ON "public"."Payment"("workspaceId", "idempotencyKey");


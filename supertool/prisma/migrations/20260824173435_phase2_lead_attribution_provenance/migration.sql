-- AlterTable
ALTER TABLE "public"."Lead" ADD COLUMN     "attributionVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referrerSource" TEXT NOT NULL DEFAULT 'none';

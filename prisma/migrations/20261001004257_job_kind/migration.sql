-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('COMPLETED', 'RECTIFICATION');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "kind" "JobKind" NOT NULL DEFAULT 'COMPLETED';

-- AlterTable
ALTER TABLE "JobItem" ADD COLUMN     "number" TEXT;

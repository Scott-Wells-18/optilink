-- CreateEnum
CREATE TYPE "IssueCause" AS ENUM ('INTERNAL_HEATING', 'TERMINAL_CONNECTION');

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "cause" "IssueCause",
ADD COLUMN     "recommendations" TEXT[];

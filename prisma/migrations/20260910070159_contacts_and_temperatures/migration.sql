-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IssueCause" ADD VALUE 'BEARING';
ALTER TYPE "IssueCause" ADD VALUE 'OVERLOAD';
ALTER TYPE "IssueCause" ADD VALUE 'VENTILATION';
ALTER TYPE "IssueCause" ADD VALUE 'ALIGNMENT';
ALTER TYPE "IssueCause" ADD VALUE 'MOTOR_TERMINAL';
ALTER TYPE "IssueCause" ADD VALUE 'WINDING';

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "hotTemp" DOUBLE PRECISION,
ADD COLUMN     "refTemp" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_siteId_idx" ON "Contact"("siteId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

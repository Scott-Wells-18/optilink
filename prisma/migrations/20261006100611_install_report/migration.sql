-- CreateEnum
CREATE TYPE "InstallPhases" AS ENUM ('SINGLE', 'THREE');

-- CreateTable
CREATE TABLE "InstallReport" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "phases" "InstallPhases" NOT NULL DEFAULT 'SINGLE',
    "sourceId" TEXT,
    "rows" JSONB NOT NULL,
    "header" JSONB,
    "pointNames" JSONB,
    "exclusions" JSONB,
    "circuits" JSONB,
    "installation" TEXT,
    "circuitDetails" TEXT,
    "contactId" TEXT,
    "instrumentId" TEXT,
    "preparedBy" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstallReport_siteId_idx" ON "InstallReport"("siteId");

-- CreateIndex
CREATE INDEX "InstallReport_date_idx" ON "InstallReport"("date");

-- AddForeignKey
ALTER TABLE "InstallReport" ADD CONSTRAINT "InstallReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallReport" ADD CONSTRAINT "InstallReport_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallReport" ADD CONSTRAINT "InstallReport_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallReport" ADD CONSTRAINT "InstallReport_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "TestEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

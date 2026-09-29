-- CreateEnum
CREATE TYPE "AmpDevice" AS ENUM ('BREAKER', 'RCBO');

-- CreateTable
CREATE TABLE "AmpReport" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "location" TEXT,
    "equipmentId" TEXT,
    "purpose" TEXT,
    "instrumentId" TEXT,
    "contactId" TEXT,
    "contactName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmpReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmpRecording" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "device" "AmpDevice",
    "fileId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmpRecording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmpReport_siteId_idx" ON "AmpReport"("siteId");

-- CreateIndex
CREATE INDEX "AmpReport_equipmentId_idx" ON "AmpReport"("equipmentId");

-- CreateIndex
CREATE INDEX "AmpReport_instrumentId_idx" ON "AmpReport"("instrumentId");

-- CreateIndex
CREATE INDEX "AmpReport_contactId_idx" ON "AmpReport"("contactId");

-- CreateIndex
CREATE INDEX "AmpRecording_reportId_idx" ON "AmpRecording"("reportId");

-- CreateIndex
CREATE INDEX "AmpRecording_fileId_idx" ON "AmpRecording"("fileId");

-- AddForeignKey
ALTER TABLE "AmpReport" ADD CONSTRAINT "AmpReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmpReport" ADD CONSTRAINT "AmpReport_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmpReport" ADD CONSTRAINT "AmpReport_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "TestEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmpReport" ADD CONSTRAINT "AmpReport_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmpRecording" ADD CONSTRAINT "AmpRecording_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AmpReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmpRecording" ADD CONSTRAINT "AmpRecording_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

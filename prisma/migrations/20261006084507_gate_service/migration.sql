-- CreateEnum
CREATE TYPE "GateKind" AS ENUM ('BOOM', 'SLIDING');

-- CreateEnum
CREATE TYPE "GateServiceKind" AS ENUM ('SCHEDULED', 'BREAKDOWN', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "GateOutcome" AS ENUM ('RETURNED', 'RETURNED_WITH_DEFECTS', 'ISOLATED');

-- CreateTable
CREATE TABLE "GateReport" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "kind" "GateKind" NOT NULL DEFAULT 'BOOM',
    "gateLocation" TEXT,
    "assetNumber" TEXT,
    "jobNumber" TEXT,
    "reportNumber" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "controllerModel" TEXT,
    "controllerFirmware" TEXT,
    "armLengthMetres" DOUBLE PRECISION,
    "accessories" TEXT[],
    "accessoryNotes" TEXT,
    "previousService" TEXT,
    "reportedFaults" TEXT,
    "serviceKind" "GateServiceKind" NOT NULL DEFAULT 'SCHEDULED',
    "weather" TEXT,
    "preparation" TEXT[],
    "manualRef" TEXT,
    "answers" JSONB,
    "supplyVoltage" TEXT,
    "earthTest" TEXT,
    "balanceNotes" TEXT,
    "lubrication" TEXT,
    "partsReplaced" TEXT,
    "testInstrument" TEXT,
    "openingTime" TEXT,
    "closingTime" TEXT,
    "autoCloseDelay" TEXT,
    "finalCycles" TEXT,
    "controllerErrors" TEXT,
    "safetyMethod" TEXT,
    "forceEquipment" TEXT,
    "workCompleted" TEXT,
    "recommendations" TEXT,
    "photoReferences" TEXT,
    "defects" JSONB,
    "outcome" "GateOutcome",
    "outcomeNotes" TEXT,
    "notifiedContactId" TEXT,
    "notifiedTime" TEXT,
    "nextServiceDue" DATE,
    "intervalBasis" TEXT,
    "technicianId" TEXT,
    "clientContactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GateReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatePhoto" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "caption" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GatePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GateReport_siteId_idx" ON "GateReport"("siteId");

-- CreateIndex
CREATE INDEX "GateReport_date_idx" ON "GateReport"("date");

-- CreateIndex
CREATE INDEX "GatePhoto_reportId_idx" ON "GatePhoto"("reportId");

-- AddForeignKey
ALTER TABLE "GateReport" ADD CONSTRAINT "GateReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateReport" ADD CONSTRAINT "GateReport_notifiedContactId_fkey" FOREIGN KEY ("notifiedContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateReport" ADD CONSTRAINT "GateReport_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateReport" ADD CONSTRAINT "GateReport_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePhoto" ADD CONSTRAINT "GatePhoto_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "GateReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePhoto" ADD CONSTRAINT "GatePhoto_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

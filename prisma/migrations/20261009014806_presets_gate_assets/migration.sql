-- AlterTable
ALTER TABLE "GateReport" ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "preset" JSONB;

-- AlterTable
ALTER TABLE "SafetyDoc" ADD COLUMN     "preset" JSONB;

-- CreateTable
CREATE TABLE "SafetyPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "selection" JSONB NOT NULL,
    "edits" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateAsset" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "assetNumber" TEXT,
    "gateLocation" TEXT,
    "kind" "GateKind" NOT NULL DEFAULT 'BOOM',
    "model" TEXT,
    "serialNumber" TEXT,
    "controllerModel" TEXT,
    "controllerFirmware" TEXT,
    "armLengthMetres" DOUBLE PRECISION,
    "accessories" TEXT[],
    "accessoryNotes" TEXT,
    "manualRef" TEXT,
    "previousService" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GateAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SafetyPreset_name_key" ON "SafetyPreset"("name");

-- CreateIndex
CREATE INDEX "GateAsset_siteId_idx" ON "GateAsset"("siteId");

-- AddForeignKey
ALTER TABLE "GateAsset" ADD CONSTRAINT "GateAsset_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateReport" ADD CONSTRAINT "GateReport_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "GateAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

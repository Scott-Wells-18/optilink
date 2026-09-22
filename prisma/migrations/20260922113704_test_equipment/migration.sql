-- AlterTable
ALTER TABLE "PowerAnalysis" ADD COLUMN     "instrumentId" TEXT;

-- CreateTable
CREATE TABLE "TestEquipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNo" TEXT,
    "modelNo" TEXT,
    "certFileId" TEXT,
    "photoFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PowerAnalysis_instrumentId_idx" ON "PowerAnalysis"("instrumentId");

-- AddForeignKey
ALTER TABLE "TestEquipment" ADD CONSTRAINT "TestEquipment_certFileId_fkey" FOREIGN KEY ("certFileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestEquipment" ADD CONSTRAINT "TestEquipment_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerAnalysis" ADD CONSTRAINT "PowerAnalysis_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "TestEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "supply" JSONB;

-- AlterTable
ALTER TABLE "PowerAnalysis" ADD COLUMN     "brief" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "equipmentId" TEXT;

-- CreateIndex
CREATE INDEX "PowerAnalysis_equipmentId_idx" ON "PowerAnalysis"("equipmentId");

-- AddForeignKey
ALTER TABLE "PowerAnalysis" ADD CONSTRAINT "PowerAnalysis_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

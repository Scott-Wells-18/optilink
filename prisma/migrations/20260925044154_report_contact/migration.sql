-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "contactId" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "contactId" TEXT;

-- AlterTable
ALTER TABLE "PowerAnalysis" ADD COLUMN     "contactId" TEXT;

-- AlterTable
ALTER TABLE "RcdReport" ADD COLUMN     "contactId" TEXT;

-- CreateIndex
CREATE INDEX "Inspection_contactId_idx" ON "Inspection"("contactId");

-- CreateIndex
CREATE INDEX "Job_contactId_idx" ON "Job"("contactId");

-- CreateIndex
CREATE INDEX "PowerAnalysis_contactId_idx" ON "PowerAnalysis"("contactId");

-- CreateIndex
CREATE INDEX "RcdReport_contactId_idx" ON "RcdReport"("contactId");

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcdReport" ADD CONSTRAINT "RcdReport_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerAnalysis" ADD CONSTRAINT "PowerAnalysis_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

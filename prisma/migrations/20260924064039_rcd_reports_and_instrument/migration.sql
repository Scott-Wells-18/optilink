-- AlterTable
ALTER TABLE "RcdTestRun" ADD COLUMN     "reportId" TEXT;

-- CreateTable
CREATE TABLE "RcdReport" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "instrumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RcdReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RcdReport_siteId_idx" ON "RcdReport"("siteId");

-- CreateIndex
CREATE INDEX "RcdReport_instrumentId_idx" ON "RcdReport"("instrumentId");

-- CreateIndex
CREATE INDEX "RcdTestRun_reportId_idx" ON "RcdTestRun"("reportId");

-- AddForeignKey
ALTER TABLE "RcdReport" ADD CONSTRAINT "RcdReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcdReport" ADD CONSTRAINT "RcdReport_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "TestEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcdTestRun" ADD CONSTRAINT "RcdTestRun_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "RcdReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

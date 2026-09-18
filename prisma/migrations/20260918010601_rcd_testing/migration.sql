-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "rcdConcernPercent" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "rcdLimits" JSONB;

-- CreateTable
CREATE TABLE "RcdTestRun" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "name" TEXT,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceFileId" TEXT,
    "parsed" JSONB,
    "corrections" JSONB,
    "checklist" JSONB,
    "mismatches" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RcdTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RcdResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "slot" TEXT,
    "label" TEXT NOT NULL,
    "ratingMa" INTEGER,
    "kind" "RcdKind",
    "halfAt0" DOUBLE PRECISION,
    "halfAt180" DOUBLE PRECISION,
    "ratedAt0" DOUBLE PRECISION,
    "ratedAt180" DOUBLE PRECISION,
    "fiveAt0" DOUBLE PRECISION,
    "fiveAt180" DOUBLE PRECISION,
    "touchVolts" DOUBLE PRECISION,
    "verdict" TEXT NOT NULL,
    "reasons" TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RcdResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RcdTestRun_siteId_idx" ON "RcdTestRun"("siteId");

-- CreateIndex
CREATE INDEX "RcdResult_runId_idx" ON "RcdResult"("runId");

-- AddForeignKey
ALTER TABLE "RcdTestRun" ADD CONSTRAINT "RcdTestRun_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcdTestRun" ADD CONSTRAINT "RcdTestRun_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcdTestRun" ADD CONSTRAINT "RcdTestRun_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcdResult" ADD CONSTRAINT "RcdResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RcdTestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

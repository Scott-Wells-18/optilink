-- CreateTable
CREATE TABLE "PowerAnalysis" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "location" TEXT,
    "sourceFileId" TEXT,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PowerAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PowerAnalysis_siteId_idx" ON "PowerAnalysis"("siteId");

-- AddForeignKey
ALTER TABLE "PowerAnalysis" ADD CONSTRAINT "PowerAnalysis_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerAnalysis" ADD CONSTRAINT "PowerAnalysis_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

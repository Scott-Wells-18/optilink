-- CreateEnum
CREATE TYPE "TagReportKind" AS ENUM ('INTERNAL', 'CLIENT');

-- CreateTable
CREATE TABLE "TaggingSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "fileId" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaggingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagReport" (
    "id" TEXT NOT NULL,
    "kind" "TagReportKind" NOT NULL,
    "siteId" TEXT,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "sourceId" TEXT,
    "items" JSONB NOT NULL,
    "customer" TEXT,
    "siteLabel" TEXT,
    "notes" TEXT[],
    "preparedBy" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TagReport_siteId_idx" ON "TagReport"("siteId");

-- CreateIndex
CREATE INDEX "TagReport_kind_date_idx" ON "TagReport"("kind", "date");

-- AddForeignKey
ALTER TABLE "TaggingSettings" ADD CONSTRAINT "TaggingSettings_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagReport" ADD CONSTRAINT "TagReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagReport" ADD CONSTRAINT "TagReport_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the `BoardPhoto` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('DUST_INGRESS', 'RISING_TEMPERATURE', 'TERMINATION_ISSUE', 'REPAIRED');

-- CreateEnum
CREATE TYPE "IssuePhotoKind" AS ENUM ('PLAIN', 'THERMAL', 'VISUAL');

-- DropForeignKey
ALTER TABLE "BoardPhoto" DROP CONSTRAINT "BoardPhoto_equipmentId_fkey";

-- DropForeignKey
ALTER TABLE "BoardPhoto" DROP CONSTRAINT "BoardPhoto_fileId_fkey";

-- DropTable
DROP TABLE "BoardPhoto";

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "type" "IssueType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuePhoto" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "kind" "IssuePhotoKind" NOT NULL DEFAULT 'PLAIN',
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssuePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inspection_siteId_idx" ON "Inspection"("siteId");

-- CreateIndex
CREATE INDEX "Issue_inspectionId_idx" ON "Issue"("inspectionId");

-- CreateIndex
CREATE INDEX "Issue_equipmentId_idx" ON "Issue"("equipmentId");

-- CreateIndex
CREATE INDEX "IssuePhoto_issueId_idx" ON "IssuePhoto"("issueId");

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuePhoto" ADD CONSTRAINT "IssuePhoto_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuePhoto" ADD CONSTRAINT "IssuePhoto_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "EquipmentKind" ADD VALUE 'MOTOR';

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "circuitLoading" TEXT;

-- CreateTable
CREATE TABLE "BoardPhoto" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "caption" TEXT,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardPhoto_equipmentId_idx" ON "BoardPhoto"("equipmentId");

-- AddForeignKey
ALTER TABLE "BoardPhoto" ADD CONSTRAINT "BoardPhoto_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardPhoto" ADD CONSTRAINT "BoardPhoto_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

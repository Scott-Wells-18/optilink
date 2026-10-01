-- CreateEnum
CREATE TYPE "ProfileTitle" AS ENUM ('ELECTRICIAN', 'APPRENTICE');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "licence" TEXT,
    "supervisor" TEXT,
    "titles" "ProfileTitle"[],
    "director" BOOLEAN NOT NULL DEFAULT false,
    "signatureFileId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_signatureFileId_fkey" FOREIGN KEY ("signatureFileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

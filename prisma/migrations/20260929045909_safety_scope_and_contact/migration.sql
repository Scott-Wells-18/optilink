-- AlterTable
ALTER TABLE "SafetyDoc" ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "scope" JSONB,
ADD COLUMN     "scopeOverrides" JSONB;

-- AddForeignKey
ALTER TABLE "SafetyDoc" ADD CONSTRAINT "SafetyDoc_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

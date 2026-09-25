-- AlterTable
ALTER TABLE "SafetyDoc" ADD COLUMN     "assessmentDate" DATE,
ADD COLUMN     "energised" JSONB,
ADD COLUMN     "jobNumber" TEXT,
ADD COLUMN     "signOff" JSONB;

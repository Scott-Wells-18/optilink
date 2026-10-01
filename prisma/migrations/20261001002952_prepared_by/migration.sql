-- AlterTable
ALTER TABLE "AmpReport" ADD COLUMN     "preparedBy" TEXT[];

-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "preparedBy" TEXT[];

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "preparedBy" TEXT[];

-- AlterTable
ALTER TABLE "PowerAnalysis" ADD COLUMN     "preparedBy" TEXT[];

-- AlterTable
ALTER TABLE "RcdReport" ADD COLUMN     "preparedBy" TEXT[];

-- AlterTable
ALTER TABLE "SafetyDoc" ADD COLUMN     "preparedBy" TEXT[];

-- AlterTable
ALTER TABLE "InstallReport" ADD COLUMN     "files" JSONB,
ADD COLUMN     "marks" JSONB,
ADD COLUMN     "arrangements" JSONB,
ADD COLUMN     "groupNames" JSONB,
ADD COLUMN     "assignments" JSONB,
ADD COLUMN     "verification" JSONB;

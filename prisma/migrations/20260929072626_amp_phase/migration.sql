-- CreateEnum
CREATE TYPE "AmpPhase" AS ENUM ('RED', 'WHITE', 'BLUE', 'NEUTRAL');

-- AlterTable
ALTER TABLE "AmpRecording" ADD COLUMN     "phase" "AmpPhase";

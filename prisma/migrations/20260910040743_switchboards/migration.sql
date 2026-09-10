-- CreateEnum
CREATE TYPE "EquipmentKind" AS ENUM ('SWITCHBOARD', 'APPLIANCE');

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "board" JSONB,
ADD COLUMN     "kind" "EquipmentKind" NOT NULL DEFAULT 'APPLIANCE';

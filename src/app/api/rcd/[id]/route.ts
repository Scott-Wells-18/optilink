import { prisma } from "@/lib/db";
import { itemHandlers } from "@/lib/crudRoute";
import { RCD_FIELDS } from "@/lib/fieldSpecs";

export const { PATCH, DELETE } = itemHandlers(prisma.rcdTest, RCD_FIELDS, "RCD test");

import { prisma } from "@/lib/db";
import { itemHandlers } from "@/lib/crudRoute";
import { THERMAL_FIELDS } from "@/lib/fieldSpecs";

export const { PATCH, DELETE } = itemHandlers(
  prisma.thermalFinding,
  THERMAL_FIELDS,
  "finding",
);

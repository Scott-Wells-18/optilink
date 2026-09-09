import { prisma } from "@/lib/db";
import { itemHandlers } from "@/lib/crudRoute";
import { OBSERVATION_FIELDS } from "@/lib/fieldSpecs";

export const { PATCH, DELETE } = itemHandlers(
  prisma.observation,
  OBSERVATION_FIELDS,
  "observation",
);

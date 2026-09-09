import { prisma } from "@/lib/db";
import { itemHandlers } from "@/lib/crudRoute";
import { PHOTO_FIELDS } from "@/lib/fieldSpecs";

export const { PATCH, DELETE } = itemHandlers(prisma.photo, PHOTO_FIELDS, "photo");

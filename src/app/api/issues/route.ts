import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import {
  ISSUE_CAUSES,
  ISSUE_TYPES,
  RECOMMENDATION_KEYS,
  needsSurvey,
  photoSlotsFor,
  type IssueCause,
  type IssueType,
  type PhotoKind,
} from "@/lib/issues";

type PhotoInput = { kind?: string; fileId?: string };

/**
 * An issue arrives whole: its type and every photo it needs. The photos are
 * uploaded first, so all that lands here are the file ids.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      inspectionId?: string;
      equipmentId?: string;
      slot?: string;
      type?: string;
      cause?: string;
      recommendations?: string[];
      note?: string;
      photos?: PhotoInput[];
    };

    if (!body.inspectionId) return badRequest("Which inspection is this for?");
    if (!body.equipmentId || !body.slot) return badRequest("Which position is this for?");
    if (!ISSUE_TYPES.includes(body.type as IssueType)) return badRequest("Pick what was found.");

    const type = body.type as IssueType;
    const photos = readPhotos(body.photos);
    const missing = photoSlotsFor(type).find(
      (slot) => !photos.some((photo) => photo.kind === slot.kind),
    );
    if (missing) return badRequest(`A ${missing.label.toLowerCase()} is required.`);

    const cause = ISSUE_CAUSES.includes(body.cause as IssueCause)
      ? (body.cause as IssueCause)
      : null;
    if (needsSurvey(type) && !cause) return badRequest("Pick what is behind it.");

    const recommendations = (body.recommendations ?? []).filter((key) =>
      RECOMMENDATION_KEYS.includes(key),
    );
    if (cause && recommendations.length === 0) {
      return badRequest("Pick at least one recommendation.");
    }

    const issue = await prisma.issue.create({
      data: {
        inspectionId: body.inspectionId,
        equipmentId: body.equipmentId,
        slot: body.slot.slice(0, 120),
        type,
        cause,
        recommendations,
        note: body.note?.trim().slice(0, 2000) || null,
        photos: { create: photos },
      },
      select: { id: true },
    });
    return NextResponse.json(issue);
  } catch (error) {
    return serverError(error, "That finding could not be saved.");
  }
}

const KINDS: PhotoKind[] = ["PLAIN", "THERMAL", "VISUAL"];

function readPhotos(input: PhotoInput[] | undefined) {
  return (input ?? [])
    .filter((photo): photo is { kind: string; fileId: string } =>
      Boolean(photo?.fileId) && KINDS.includes(photo?.kind as PhotoKind),
    )
    .map((photo) => ({ kind: photo.kind as PhotoKind, fileId: photo.fileId }));
}

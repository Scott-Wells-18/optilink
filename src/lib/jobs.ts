/** The stages a piece of work is photographed at. */
export type JobPhotoStage = "BEFORE" | "DURING" | "AFTER";

export const JOB_STAGES: readonly JobPhotoStage[] = ["BEFORE", "DURING", "AFTER"];

export const STAGE_LABELS: Record<JobPhotoStage, string> = {
  BEFORE: "Before",
  DURING: "During",
  AFTER: "After",
};

export const STAGE_NOTES: Record<JobPhotoStage, string> = {
  BEFORE: "How it was found. Required. Up to nine.",
  DURING: "The work in progress. Optional. Up to nine.",
  AFTER: "How it was left. Required. Up to nine.",
};

/**
 * How many photographs one stage of one item will take.
 *
 * Nine, because nine is what a page holds: three across and three down, at a
 * size a photograph is still worth looking at. A tenth would either shrink the
 * other nine or start a second page of the same stage, and neither reads as a
 * record of the work.
 */
export const MAX_PHOTOS_PER_STAGE = 9;

/**
 * The budget a works photograph is resized to before it is uploaded.
 *
 * A tile on the finished page is about 162 points across — a shade over two
 * inches — so 1100 pixels on the long edge is still more than twice what the
 * page can print, and a photograph that arrives off a phone at four megabytes
 * lands at around a tenth of that. Twenty-seven photographs an item, several
 * items a visit, week after week, is what fills a volume; this is what stops
 * it.
 */
export const PHOTO_BUDGET = { maxEdge: 1100, quality: 0.72 };

export type JobPhotoInput = { stage?: string; fileId?: string };

/**
 * The photos as they will be stored: grouped by stage, in the order they were
 * added, and never more than a page of any one stage.
 */
export function readJobPhotos(input: JobPhotoInput[] | undefined) {
  const wanted = (input ?? []).filter(
    (photo): photo is { stage: JobPhotoStage; fileId: string } =>
      Boolean(photo?.fileId) && JOB_STAGES.includes(photo?.stage as JobPhotoStage),
  );

  return JOB_STAGES.flatMap((stage) =>
    wanted
      .filter((photo) => photo.stage === stage)
      .slice(0, MAX_PHOTOS_PER_STAGE)
      .map((photo, position) => ({ stage, fileId: photo.fileId, position })),
  );
}

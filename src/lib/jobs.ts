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


/**
 * What a piece of work still needs before it is finished.
 *
 * A job gets done and written up at different times: the photographs are
 * taken with the board open and the words often wait until the next morning.
 * So a piece of work can be saved with whatever there is so far and finished
 * later — it is simply marked as not finished yet, and says what is short.
 *
 * Nothing unfinished goes on a report. A works record is what was done, and
 * half a sentence about it is not that.
 */
export type WorkParts = {
  title?: string | null;
  location?: string | null;
  found?: string | null;
  done?: string | null;
  photos: { stage: JobPhotoStage }[];
};

export function whatIsMissing(item: WorkParts): string[] {
  const missing: string[] = [];
  if (!item.title?.trim()) missing.push("what it was");
  if (!item.location?.trim()) missing.push("where");
  if (!item.found?.trim()) missing.push("how you found it");
  if (!item.done?.trim()) missing.push("what you did");
  if (!item.photos.some((photo) => photo.stage === "BEFORE")) missing.push("a before photo");
  if (!item.photos.some((photo) => photo.stage === "AFTER")) missing.push("an after photo");
  return missing;
}

export function isComplete(item: WorkParts): boolean {
  return whatIsMissing(item).length === 0;
}

/** "Needs where and an after photo." */
export function missingReads(missing: string[]): string {
  if (missing.length === 0) return "";
  if (missing.length === 1) return `Needs ${missing[0]}.`;
  const last = missing[missing.length - 1];
  return `Needs ${missing.slice(0, -1).join(", ")} and ${last}.`;
}

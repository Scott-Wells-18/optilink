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
  number?: string | null;
  photos: { stage: JobPhotoStage }[];
};

/**
 * What a record is for, which decides what it needs.
 *
 * A completed record is a before and an after: what was found, what was done,
 * and a photograph of each. A rectification is a proposal — the job, what it
 * needs, and photographs of how it stands now — so it asks for those instead
 * of asking what was done about something nobody has done yet.
 */
export type JobKind = "COMPLETED" | "RECTIFICATION";

export const JOB_KIND_LABELS: Record<JobKind, string> = {
  COMPLETED: "Works Completed Report",
  RECTIFICATION: "Recommended Rectifications Report",
};

export const JOB_KIND_NOTES: Record<JobKind, string> = {
  COMPLETED: "What was done, before and after, with the photographs to show it.",
  RECTIFICATION:
    "What we recommend doing, with photographs of how it stands now. Issued with a quotation.",
};

/**
 * Which stages a kind of report photographs.
 *
 * A completed record is a before, a during and an after. A recommendation has
 * only one: how the job stands now. There is no "after" of something nobody
 * has done, and offering the slot would only invite somebody to put the wrong
 * thing in it.
 */
export function stagesFor(kind: JobKind): readonly JobPhotoStage[] {
  return kind === "RECTIFICATION" ? ["BEFORE"] : JOB_STAGES;
}

/** What that one slot is called on a recommendation, where "Before" means nothing. */
export function stageLabel(stage: JobPhotoStage, kind: JobKind): string {
  if (kind === "RECTIFICATION" && stage === "BEFORE") return "Photos of the job";
  return STAGE_LABELS[stage];
}

export function stageNote(stage: JobPhotoStage, kind: JobKind): string {
  if (kind === "RECTIFICATION" && stage === "BEFORE") {
    return "How the job stands now. Required. Up to nine.";
  }
  return STAGE_NOTES[stage];
}

export function whatIsMissing(item: WorkParts, kind: JobKind = "COMPLETED"): string[] {
  const missing: string[] = [];
  if (kind === "RECTIFICATION") {
    if (!item.title?.trim()) missing.push("the job name");
    if (!item.done?.trim()) missing.push("what it needs");
    if (!item.photos.some((photo) => photo.stage === "BEFORE")) missing.push("a photo of the job");
    return missing;
  }
  if (!item.title?.trim()) missing.push("what it was");
  if (!item.location?.trim()) missing.push("where");
  if (!item.found?.trim()) missing.push("how you found it");
  if (!item.done?.trim()) missing.push("what you did");
  if (!item.photos.some((photo) => photo.stage === "BEFORE")) missing.push("a before photo");
  if (!item.photos.some((photo) => photo.stage === "AFTER")) missing.push("an after photo");
  return missing;
}

export function isComplete(item: WorkParts, kind: JobKind = "COMPLETED"): boolean {
  return whatIsMissing(item, kind).length === 0;
}

/** "Needs where and an after photo." */
export function missingReads(missing: string[]): string {
  if (missing.length === 0) return "";
  if (missing.length === 1) return `Needs ${missing[0]}.`;
  const last = missing[missing.length - 1];
  return `Needs ${missing.slice(0, -1).join(", ")} and ${last}.`;
}

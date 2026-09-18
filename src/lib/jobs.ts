/** The stages a piece of work is photographed at. */
export type JobPhotoStage = "BEFORE" | "DURING" | "AFTER";

export const JOB_STAGES: readonly JobPhotoStage[] = ["BEFORE", "DURING", "AFTER"];

export const STAGE_LABELS: Record<JobPhotoStage, string> = {
  BEFORE: "Before",
  DURING: "During",
  AFTER: "After",
};

export const STAGE_NOTES: Record<JobPhotoStage, string> = {
  BEFORE: "How it was found. Required.",
  DURING: "The work in progress. Optional.",
  AFTER: "How it was left. Required.",
};

export type JobPhotoInput = { stage?: string; fileId?: string };

export function readJobPhotos(input: JobPhotoInput[] | undefined) {
  return (input ?? [])
    .filter(
      (photo): photo is { stage: JobPhotoStage; fileId: string } =>
        Boolean(photo?.fileId) && JOB_STAGES.includes(photo?.stage as JobPhotoStage),
    )
    .slice(0, 30)
    .map((photo, index) => ({
      stage: photo.stage,
      fileId: photo.fileId,
      position: index,
    }));
}


/**
 * Who puts their name to the company's documents.
 *
 * A profile is a person and what is on file for them, and what is on file
 * decides what they can sign:
 *
 *  - a name and a signature are enough for a SWMS or a JSA, because signing
 *    one is a record of having read it;
 *  - a contractor licence as well, and they can be named as having prepared a
 *    report — that licence is what authorises the work the report describes;
 *  - a supervisor certificate is never required and is printed where it is
 *    held.
 *
 * Nothing here invents a credential. A profile without a licence simply does
 * not appear in the list of people a report can be prepared by, which is a
 * quieter way of being right than letting it be chosen and leaving the line
 * blank on the page.
 */

export type Title = "ELECTRICIAN" | "APPRENTICE";

export const TITLE_LABELS: Record<Title, string> = {
  ELECTRICIAN: "Electrician",
  APPRENTICE: "Apprentice Electrician",
};

export type ProfileRow = {
  id: string;
  firstName: string;
  lastName: string;
  licence: string | null;
  supervisor: string | null;
  titles: Title[];
  director: boolean;
  signatureFileId: string | null;
};

export function fullName(profile: { firstName: string; lastName: string }): string {
  return `${profile.firstName} ${profile.lastName}`.replace(/\s+/g, " ").trim();
}

/**
 * What they are called under their signature.
 *
 * The director goes first where somebody is one, because that is the senior
 * thing about them; an apprentice is named an apprentice, which is the whole
 * point of printing it.
 */
export function roleOf(profile: { titles: Title[]; director: boolean }): string {
  return [profile.director ? "Director" : null, ...profile.titles.map((title) => TITLE_LABELS[title])]
    .filter(Boolean)
    .join("  ·  ");
}

/** Enough on file to sign a SWMS or a JSA: a name and a mark. */
export function canSignSafety(profile: { signatureFileId: string | null }): boolean {
  return Boolean(profile.signatureFileId);
}

/** Enough on file to be named as having prepared a report. */
export function canPrepareReports(profile: {
  signatureFileId: string | null;
  licence: string | null;
}): boolean {
  return canSignSafety(profile) && Boolean(profile.licence?.trim());
}

/* --- reading one off a request -------------------------------------------- */

const TITLES: Title[] = ["ELECTRICIAN", "APPRENTICE"];

/** Whitelisted, so a stray key in a request body can never reach the table. */
export function readProfile(body: Record<string, unknown>) {
  const text = (value: unknown, max = 120) => {
    const out = String(value ?? "").trim().slice(0, max);
    return out || null;
  };
  const titles = Array.isArray(body.titles)
    ? (body.titles.filter((title) => TITLES.includes(title as Title)) as Title[])
    : [];

  return {
    firstName: text(body.firstName) ?? "",
    lastName: text(body.lastName) ?? "",
    licence: text(body.licence, 40),
    supervisor: text(body.supervisor, 40),
    titles,
    director: Boolean(body.director),
    signatureFileId: text(body.signatureFileId, 60),
  };
}

/**
 * The profiles named as having prepared a report.
 *
 * Ids only: the names, the numbers and the signature are read off the profile
 * when the report is drawn, so renaming somebody renames them everywhere.
 */
export function readPreparedBy(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 8);
}

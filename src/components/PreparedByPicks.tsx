"use client";

import { useEffect, useState } from "react";
import { TITLE_LABELS, canPrepareReports, canSignSafety, fullName, type Title } from "@/lib/profiles";

/**
 * Who a document is prepared by, chosen inside a dialog rather than beside it.
 *
 * The same rule as everywhere else: only the people who may be named on this
 * kind of document are offered, and anybody who cannot be is listed with the
 * reason rather than quietly left out — somebody looking for a name they
 * expected to see should find out why it is not there.
 */

type Profile = {
  id: string;
  firstName: string;
  lastName: string;
  licence: string | null;
  supervisor: string | null;
  titles: Title[];
  director: boolean;
  signatureFileId: string | null;
};

export function PreparedByPicks({
  chosen,
  needs = "reports",
  onChange,
}: {
  chosen: string[];
  needs?: "reports" | "safety";
  onChange: (next: string[]) => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    void fetch("/api/profiles", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setProfiles)
      .catch(() => {});
  }, []);

  const allowed = (profile: Profile) =>
    needs === "safety" ? canSignSafety(profile) : canPrepareReports(profile);
  const usable = profiles.filter(allowed);
  const rest = profiles.filter((profile) => !allowed(profile));

  const toggle = (id: string) =>
    onChange(chosen.includes(id) ? chosen.filter((other) => other !== id) : [...chosen, id]);

  return (
    <>
      <div className="issue-picks">
        {usable.map((profile) => (
          <button
            key={profile.id}
            type="button"
            className={`issue-pick ${chosen.includes(profile.id) ? "is-on" : ""}`}
            onClick={() => toggle(profile.id)}
          >
            <span className="issue-pick-mark is-one" aria-hidden />
            <span className="issue-pick-body">
              <span className="issue-pick-label">{fullName(profile)}</span>
              <span className="issue-pick-note">
                {[
                  profile.director ? "Director" : null,
                  ...profile.titles.map((title) => TITLE_LABELS[title]),
                  profile.licence ? `Lic ${profile.licence}` : null,
                  profile.supervisor ? `Supervisor ${profile.supervisor}` : null,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </span>
            </span>
          </button>
        ))}
      </div>

      {chosen.length === 0 ? (
        <p className="amp-hint is-standalone">
          With nobody chosen it is prepared by the director, as it was before this could be
          chosen.
          {rest.length > 0
            ? ` ${rest.map(fullName).join(" and ")} cannot be named on this: no contractor licence on file.`
            : ""}
        </p>
      ) : null}
    </>
  );
}

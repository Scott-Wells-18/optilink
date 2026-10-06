"use client";

import { useEffect, useState } from "react";
import { DialogScrim } from "@/components/DialogScrim";

/**
 * Which customer and site out of a spreadsheet a report is about.
 *
 * An export is usually one customer, and then there is nothing to choose and
 * this says so. A register pulled across a whole account is not, and then the
 * choice matters more than anything else on the report: equipment listed under
 * the wrong customer's name is worse than equipment not listed at all.
 *
 * Nothing is relabelled either way. Choosing a pairing narrows the report to
 * that pairing's own rows; leaving it alone prints every row with a band above
 * each group naming whose it is.
 */

type Group = { customer: string; site: string; count: number };

export function TagGroupDialog({
  reportId,
  onClose,
  onSaved,
}: {
  reportId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [chosen, setChosen] = useState<{ customer: string; site: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/tag-reports/${reportId}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((report) => {
        if (!report) return;
        setGroups(report.groups ?? []);
        if (report.customer && report.siteLabel) {
          setChosen({ customer: report.customer, site: report.siteLabel });
        }
      })
      .catch(() => setError("That report could not be loaded."));
  }, [reportId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(pick: { customer: string; site: string } | null) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tag-reports/${reportId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: pick?.customer ?? null,
          siteLabel: pick?.site ?? null,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That could not be saved.");
      }
      setChosen(pick);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "That could not be saved.");
      setBusy(false);
    }
  }

  const same = (a: { customer: string; site: string } | null, b: Group) =>
    a?.customer === b.customer && a?.site === b.site;

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Whose equipment">
      <DialogScrim />

      <div className="dialog is-issue">
        <div className="issue-head">
          <h2 className="dialog-title">Whose equipment is this?</h2>
          <p className="board-section-note">
            {groups === null
              ? "Reading the spreadsheet…"
              : groups.length === 1
                ? "This spreadsheet holds one customer and site."
                : `This spreadsheet holds ${groups.length} customers and sites.`}
          </p>
        </div>

        <div className="dialog-fields">
          <div className="issue-picks">
            {(groups ?? []).map((group) => (
              <button
                key={`${group.customer}|${group.site}`}
                type="button"
                className={`issue-pick ${same(chosen, group) ? "is-on" : ""}`}
                disabled={busy}
                onClick={() => void save({ customer: group.customer, site: group.site })}
              >
                <span className="issue-pick-mark is-one" aria-hidden />
                <span className="issue-pick-body">
                  <span className="issue-pick-label">{group.customer}</span>
                  <span className="issue-pick-note">
                    {group.site}
                    {"  ·  "}
                    {group.count} {group.count === 1 ? "item" : "items"}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {groups !== null && groups.length > 1 ? (
            <>
              <button
                type="button"
                className={`issue-pick ${chosen === null ? "is-on" : ""}`}
                disabled={busy}
                onClick={() => void save(null)}
              >
                <span className="issue-pick-mark is-one" aria-hidden />
                <span className="issue-pick-body">
                  <span className="issue-pick-label">List all of them</span>
                  <span className="issue-pick-note">
                    Every row, with a band above each group naming whose it is
                  </span>
                </span>
              </button>
              <p className="amp-hint is-standalone">
                Choosing one narrows the report to that customer&rsquo;s own rows. Nothing is
                renamed either way: equipment keeps the customer and site the spreadsheet gave
                it.
              </p>
            </>
          ) : null}
        </div>

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-actions">
          <button type="button" className="dialog-confirm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

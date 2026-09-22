"use client";

import { STREET, inWords, missingFrom, type Supply } from "@/lib/supply";

/**
 * A switchboard's own details, asked once where the board is drawn.
 *
 * The same panel on the grid editor, on the freehand editor and on a power
 * analysis, because it is the same six facts in all three places and a person
 * filling it in at the board should not have to learn it twice. Whichever of
 * the three saves it, it is written onto the board itself, so the next report
 * off that board already knows.
 *
 * Where it is fed from is a choice rather than a field: the street, or one of
 * the other boards already drawn at this site. Typing "MSB" into a box on one
 * board and "Main Switchboard" on another leaves nothing that can be followed
 * back up the site.
 */
export function SupplyFields({
  supply,
  siblings,
  onChange,
}: {
  supply: Supply;
  /** The other switchboards at this site, by id and name. */
  siblings: { id: string; name: string }[];
  onChange: (next: Supply) => void;
}) {
  const known = supply.fedFrom === STREET || siblings.some((b) => b.id === supply.fedFrom);
  const elsewhere = !known && (supply.fedFrom !== null || supply.fedFromNote !== null);
  const missing = missingFrom(supply);

  function set<K extends keyof Supply>(key: K, value: Supply[K]) {
    onChange({ ...supply, [key]: value });
  }

  function choose(id: string) {
    onChange({ ...supply, fedFrom: id, fedFromNote: null });
  }

  return (
    <section className="supply">
      <div className="board-section-head">
        <h3 className="board-section-title">Whereabouts is the board?</h3>
        <p className="board-section-note">
          The part of the site someone would be sent to. A depot has several boards,
          and &ldquo;the main switchboard&rdquo; is not a place.
        </p>
      </div>
      <label className="dialog-field">
        <span className="dialog-label">Area</span>
        <input
          className="dialog-input"
          placeholder="e.g. Workshop, north wall · Level 2 plant room"
          value={supply.area ?? ""}
          onChange={(event) => set("area", event.target.value || null)}
        />
      </label>

      <div className="board-section-head">
        <h3 className="board-section-title">Where is it fed from?</h3>
        <p className="board-section-note">
          The street, or another board on this site. This is what a power analysis
          reads the current against.
        </p>
      </div>

      <div className="issue-picks">
        <button
          type="button"
          className={`issue-pick ${supply.fedFrom === STREET ? "is-on" : ""}`}
          onClick={() => choose(STREET)}
        >
          <span className="issue-pick-mark is-one" aria-hidden />
          <span className="issue-pick-body">
            <span className="issue-pick-label">The street</span>
            <span className="issue-pick-note">Straight off the network supply</span>
          </span>
        </button>

        {siblings.map((board) => (
          <button
            key={board.id}
            type="button"
            className={`issue-pick ${supply.fedFrom === board.id ? "is-on" : ""}`}
            onClick={() => choose(board.id)}
          >
            <span className="issue-pick-mark is-one" aria-hidden />
            <span className="issue-pick-body">
              <span className="issue-pick-label">{board.name}</span>
              <span className="issue-pick-note">A board already drawn at this site</span>
            </span>
          </button>
        ))}

        <button
          type="button"
          className={`issue-pick ${elsewhere ? "is-on" : ""}`}
          onClick={() => onChange({ ...supply, fedFrom: null, fedFromNote: "" })}
        >
          <span className="issue-pick-mark is-one" aria-hidden />
          <span className="issue-pick-body">
            <span className="issue-pick-label">Somewhere else</span>
          </span>
        </button>
      </div>

      {elsewhere ? (
        <label className="dialog-field">
          <span className="dialog-label">What feeds it</span>
          <input
            className="dialog-input"
            autoFocus
            placeholder="e.g. the transformer in the yard, the landlord's board"
            value={supply.fedFromNote ?? ""}
            onChange={(event) => set("fedFromNote", event.target.value)}
          />
        </label>
      ) : null}

      <div className="board-section-head">
        <h3 className="board-section-title">The feed itself</h3>
        <p className="board-section-note">
          All four are needed before a power analysis can be issued off this board:
          the current it recorded is read against them.
        </p>
      </div>

      <div className="supply-grid">
        <label className="dialog-field">
          <span className="dialog-label">
            Length of run <em>metres</em>
          </span>
          <input
            className="dialog-input"
            inputMode="decimal"
            placeholder="e.g. 45"
            value={supply.lengthM === null ? "" : String(supply.lengthM)}
            onChange={(event) => {
              const value = Number(event.target.value.replace(/[^0-9.]/g, ""));
              set("lengthM", event.target.value.trim() && Number.isFinite(value) ? value : null);
            }}
          />
        </label>

        <label className="dialog-field">
          <span className="dialog-label">Protective device</span>
          <input
            className="dialog-input"
            placeholder="e.g. 100 A HRC fuse"
            value={supply.protectiveDevice ?? ""}
            onChange={(event) => set("protectiveDevice", event.target.value || null)}
          />
        </label>

        <label className="dialog-field">
          <span className="dialog-label">Mains, active</span>
          <input
            className="dialog-input"
            placeholder="e.g. 25 mm² Cu XLPE"
            value={supply.activeCable ?? ""}
            onChange={(event) => set("activeCable", event.target.value || null)}
          />
        </label>

        <label className="dialog-field">
          <span className="dialog-label">Mains, neutral</span>
          <input
            className="dialog-input"
            placeholder="e.g. 16 mm² Cu"
            value={supply.neutralCable ?? ""}
            onChange={(event) => set("neutralCable", event.target.value || null)}
          />
        </label>
      </div>

      {missing.length > 0 ? (
        <p className="board-warning">
          A power analysis cannot be issued off this board until it knows{" "}
          {inWords(missing)}.
        </p>
      ) : null}
    </section>
  );
}

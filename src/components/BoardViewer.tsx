"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  COLUMNS,
  STATE_LABELS,
  isDevice,
  positionNumber,
  type Board,
  type BoardCell,
} from "@/lib/board";
import { uploadImage } from "@/components/ImageUpload";

/**
 * The board as drawn, read only, for pinning thermal photos to it.
 *
 * Only positions carrying a device can be picked — a blank or an empty way has
 * nothing to photograph.
 */

type Photo = { id: string; slot: string; fileId: string; caption: string | null };

export function BoardViewer({
  equipmentId,
  name,
  board,
  onClose,
}: {
  equipmentId: string;
  name: string;
  board: Board;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/equipment/${equipmentId}/photos`, {
        cache: "no-store",
      });
      if (response.ok) setPhotos(await response.json());
    } catch {
      // Leaving the list as-is is better than blanking it on a hiccup.
    }
  }, [equipmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (slot) setSlot(null);
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slot, onClose]);

  async function addPhoto(files: FileList | null) {
    if (!files?.length || !slot) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const image = await uploadImage(file);
        const response = await fetch("/api/board-photos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ equipmentId, slot, fileId: image.id }),
        });
        if (!response.ok) throw new Error("The photo could not be saved.");
      }
      await refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(id: string) {
    const response = await fetch(`/api/board-photos/${id}`, { method: "DELETE" });
    if (response.ok) await refresh();
  }

  const countFor = (key: string) => photos.filter((photo) => photo.slot === key).length;
  const selected = slot ? cellForSlot(board, slot) : null;
  const selectedPhotos = slot ? photos.filter((photo) => photo.slot === slot) : [];

  const rows = Array.from({ length: board.rows }, (_, row) =>
    Array.from({ length: COLUMNS }, (_, column) => row * COLUMNS + column),
  );

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label={name}>
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />

      <div className="board is-viewer">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">{name}</h2>
            <p className="board-section-note">
              Pick a breaker, RCD or contactor to add photos to it. Blanks and empty
              ways cannot be picked.
            </p>
          </div>
        </header>

        <div className="board-body">
          {board.extras.length > 0 ? (
            <section className="board-extras">
              <div className="board-section-head">
                <h3 className="board-section-title">Additional</h3>
              </div>
              <div className="board-extra-row">
                {board.extras.map((cell, index) => (
                  <ViewCell
                    key={index}
                    cell={cell}
                    slot={`extra:${index}`}
                    active={slot === `extra:${index}`}
                    photos={countFor(`extra:${index}`)}
                    onPick={setSlot}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <div className="board-section-head">
              <h3 className="board-section-title">Board</h3>
            </div>
            <div className="board-grid">
              {rows.map((indexes, row) => (
                <div className="board-row" key={row}>
                  {indexes.map((index) => (
                    <ViewCell
                      key={index}
                      cell={board.cells[index]}
                      number={positionNumber(board, index)}
                      slot={`cell:${index}`}
                      active={slot === `cell:${index}`}
                      photos={countFor(`cell:${index}`)}
                      onPick={setSlot}
                    />
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>

        {slot && selected ? (
          <section className="board-picked">
            <div className="board-picked-head">
              <div>
                <p className="board-picked-title">
                  {selected.label || "Unnamed"}{" "}
                  <span className="board-picked-kind">{STATE_LABELS[selected.state]}</span>
                </p>
                <p className="board-section-note">
                  {selectedPhotos.length
                    ? `${selectedPhotos.length} photo${selectedPhotos.length === 1 ? "" : "s"}`
                    : "No photos yet"}
                </p>
              </div>
              <label className="dialog-confirm board-upload">
                {busy ? "Uploading…" : "Add photo"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(event) => void addPhoto(event.target.files)}
                />
              </label>
            </div>

            {error ? <p className="dialog-error">{error}</p> : null}

            {selectedPhotos.length ? (
              <div className="board-picked-photos">
                {selectedPhotos.map((photo) => (
                  <figure key={photo.id} className="board-photo">
                    <Image
                      src={`/api/files/${photo.fileId}`}
                      alt={photo.caption ?? "Thermal photo"}
                      width={280}
                      height={210}
                    />
                    <button
                      type="button"
                      className="board-photo-remove"
                      aria-label="Remove photo"
                      onClick={() => void removePhoto(photo.id)}
                    >
                      ×
                    </button>
                  </figure>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <footer className="board-foot">
          <div className="dialog-actions">
            <button type="button" className="dialog-cancel" onClick={onClose}>
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ViewCell({
  cell,
  number,
  slot,
  active,
  photos,
  onPick,
}: {
  cell: BoardCell;
  number?: number;
  slot: string;
  active: boolean;
  photos: number;
  onPick: (slot: string) => void;
}) {
  const selectable = isDevice(cell.state);
  return (
    <div
      className={`board-cell is-${cell.state.toLowerCase()} ${
        selectable ? "is-selectable" : "is-locked"
      } ${active ? "is-picked" : ""}`}
      onClick={() => selectable && onPick(slot)}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : -1}
      title={STATE_LABELS[cell.state]}
      onKeyDown={(event) => {
        if (!selectable) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick(slot);
        }
      }}
    >
      <span className="board-cell-no">{number ?? "R"}</span>
      <span className={`board-cell-text ${cell.label ? "" : "is-blank"}`}>
        {cell.label || (selectable ? "Unnamed" : "")}
      </span>
      {photos > 0 ? <span className="board-cell-count">{photos}</span> : null}
    </div>
  );
}

function cellForSlot(board: Board, slot: string): BoardCell | null {
  const [kind, raw] = slot.split(":");
  const index = Number(raw);
  if (Number.isNaN(index)) return null;
  return kind === "extra" ? (board.extras[index] ?? null) : (board.cells[index] ?? null);
}

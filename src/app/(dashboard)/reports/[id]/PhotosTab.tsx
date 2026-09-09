"use client";

import Image from "next/image";
import { useState } from "react";
import { TextArea, TextField } from "@/components/fields";
import { ImageUpload, uploadImage, type UploadedImage } from "@/components/ImageUpload";
import { EmptyState } from "@/components/PageHeader";
import { sendPatch, useDebouncedPatch } from "@/components/saving";
import type { PhotoRow, TabProps } from "./types";

export function PhotosTab({ report, setReport }: TabProps) {
  const [busy, setBusy] = useState(false);

  const pairs = groupPairs(report.photos);
  const general = report.photos.filter((photo) => photo.kind === "GENERAL");

  async function createPhoto(input: {
    fileId: string;
    kind: PhotoRow["kind"];
    pairKey?: string | null;
    title?: string | null;
  }) {
    const response = await sendPatch(`/api/reports/${report.id}/photos`, input, "POST");
    if (!response) return null;
    const photo = (await response.json()) as PhotoRow;
    setReport((current) => ({ ...current, photos: [...current.photos, photo] }));
    return photo;
  }

  async function addPair() {
    // The pair is created by uploading into it — start with an empty shell.
    setPendingPairs((current) => [...current, newPairKey()]);
  }

  const [pendingPairs, setPendingPairs] = useState<string[]>([]);

  async function addGeneral(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      try {
        const image: UploadedImage = await uploadImage(file);
        await createPhoto({ fileId: image.id, kind: "GENERAL" });
      } catch {
        // Skip the file that failed and carry on with the rest.
      }
    }
    setBusy(false);
  }

  const allPairKeys = [
    ...pairs.map((pair) => pair.key),
    ...pendingPairs.filter((key) => !pairs.some((pair) => pair.key === key)),
  ];

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="card-title">Before &amp; after</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Side-by-side photos are the part clients understand instantly. Pair
            them up here and they print together with your caption underneath.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-secondary cursor-pointer">
            {busy ? "Uploading…" : "Add site photos"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void addGeneral(event.target.files)}
            />
          </label>
          <button type="button" className="btn-primary" onClick={() => void addPair()}>
            Add before &amp; after pair
          </button>
        </div>
      </div>

      {allPairKeys.length === 0 && general.length === 0 ? (
        <EmptyState
          title="No photos yet"
          description="Add a before and after pair to show the work you carried out, or drop in general site photos for context."
        />
      ) : null}

      {allPairKeys.length > 0 ? (
        <div className="space-y-4">
          {allPairKeys.map((key, index) => {
            const pair = pairs.find((entry) => entry.key === key);
            return (
              <PairCard
                key={key}
                index={index}
                pairKey={key}
                before={pair?.before ?? null}
                after={pair?.after ?? null}
                onUpload={(kind, image) =>
                  createPhoto({
                    fileId: image.id,
                    kind,
                    pairKey: key,
                    title: pair?.before?.title ?? pair?.after?.title ?? null,
                  })
                }
                onPatch={(photoId, update) =>
                  setReport((current) => ({
                    ...current,
                    photos: current.photos.map((row) =>
                      row.id === photoId ? { ...row, ...update } : row,
                    ),
                  }))
                }
                onRemovePhoto={(photoId) =>
                  setReport((current) => ({
                    ...current,
                    photos: current.photos.filter((row) => row.id !== photoId),
                  }))
                }
                onRemovePair={() =>
                  setPendingPairs((current) => current.filter((entry) => entry !== key))
                }
              />
            );
          })}
        </div>
      ) : null}

      {general.length > 0 ? (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Site photos</h2>
            <span className="text-xs text-slate-500">{general.length} photos</span>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {general.map((photo) => (
              <GeneralPhotoCard
                key={photo.id}
                photo={photo}
                onPatch={(update) =>
                  setReport((current) => ({
                    ...current,
                    photos: current.photos.map((row) =>
                      row.id === photo.id ? { ...row, ...update } : row,
                    ),
                  }))
                }
                onDelete={() =>
                  setReport((current) => ({
                    ...current,
                    photos: current.photos.filter((row) => row.id !== photo.id),
                  }))
                }
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PairCard({
  index,
  pairKey,
  before,
  after,
  onUpload,
  onPatch,
  onRemovePhoto,
  onRemovePair,
}: {
  index: number;
  pairKey: string;
  before: PhotoRow | null;
  after: PhotoRow | null;
  onUpload: (kind: "BEFORE" | "AFTER", image: UploadedImage) => Promise<PhotoRow | null>;
  onPatch: (photoId: string, update: Partial<PhotoRow>) => void;
  onRemovePhoto: (photoId: string) => void;
  onRemovePair: () => void;
}) {
  // The caption lives on whichever photo exists, so it survives a re-upload.
  const captionHost = before ?? after;
  const { patch } = useDebouncedPatch(
    captionHost ? `/api/photos/${captionHost.id}` : "/api/photos/none",
  );

  async function removePhoto(photo: PhotoRow) {
    const response = await sendPatch(`/api/photos/${photo.id}`, null, "DELETE");
    if (response) onRemovePhoto(photo.id);
  }

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {index + 1}
          </span>
          <p className="text-sm font-semibold text-slate-900">
            {captionHost?.title?.trim() || "Before & after"}
          </p>
        </div>
        {!before && !after ? (
          <button type="button" onClick={onRemovePair} className="btn-ghost text-xs">
            Remove
          </button>
        ) : null}
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <PairSlot
            label="Before"
            photo={before}
            onUploaded={(image) => void onUpload("BEFORE", image)}
            onCleared={() => before && void removePhoto(before)}
          />
          <PairSlot
            label="After"
            photo={after}
            onUploaded={(image) => void onUpload("AFTER", image)}
            onCleared={() => after && void removePhoto(after)}
          />
        </div>

        {captionHost ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Title"
              value={captionHost.title ?? ""}
              onChange={(value) => {
                onPatch(captionHost.id, { title: value });
                patch({ title: value, pairKey });
                if (before && after) {
                  const other = captionHost.id === before.id ? after : before;
                  onPatch(other.id, { title: value });
                  void sendPatch(`/api/photos/${other.id}`, { title: value });
                }
              }}
              placeholder="e.g. Main switchboard — C7 fuse holder"
            />
            <TextField
              label="Location"
              value={captionHost.location ?? ""}
              onChange={(value) => {
                onPatch(captionHost.id, { location: value });
                patch({ location: value });
              }}
            />
            <TextArea
              label="Caption"
              className="sm:col-span-2"
              rows={2}
              value={captionHost.caption ?? ""}
              onChange={(value) => {
                onPatch(captionHost.id, { caption: value });
                patch({ caption: value });
              }}
              placeholder="e.g. Overheating fuse holder replaced and terminations re-torqued. Re-scan showed no temperature rise."
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PairSlot({
  label,
  photo,
  onUploaded,
  onCleared,
}: {
  label: string;
  photo: PhotoRow | null;
  onUploaded: (image: UploadedImage) => void;
  onCleared: () => void;
}) {
  return (
    <ImageUpload
      label={label}
      fileId={photo?.fileId ?? null}
      onUploaded={onUploaded}
      onCleared={onCleared}
    />
  );
}

function GeneralPhotoCard({
  photo,
  onPatch,
  onDelete,
}: {
  photo: PhotoRow;
  onPatch: (update: Partial<PhotoRow>) => void;
  onDelete: () => void;
}) {
  const { patch } = useDebouncedPatch(`/api/photos/${photo.id}`);

  async function remove() {
    const response = await sendPatch(`/api/photos/${photo.id}`, null, "DELETE");
    if (response) onDelete();
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <Image
        src={`/api/files/${photo.fileId}`}
        alt={photo.caption ?? "Site photo"}
        width={640}
        height={480}
        className="aspect-4/3 w-full rounded object-cover"
      />
      <TextField
        value={photo.caption ?? ""}
        onChange={(value) => {
          onPatch({ caption: value });
          patch({ caption: value });
        }}
        placeholder="Caption"
      />
      <button type="button" onClick={() => void remove()} className="btn-ghost text-xs text-red-600">
        Remove
      </button>
    </div>
  );
}

function groupPairs(photos: PhotoRow[]) {
  const map = new Map<string, { key: string; before: PhotoRow | null; after: PhotoRow | null }>();
  for (const photo of photos) {
    if (photo.kind === "GENERAL" || !photo.pairKey) continue;
    const entry = map.get(photo.pairKey) ?? {
      key: photo.pairKey,
      before: null,
      after: null,
    };
    if (photo.kind === "BEFORE") entry.before = photo;
    if (photo.kind === "AFTER") entry.after = photo;
    map.set(photo.pairKey, entry);
  }
  return [...map.values()];
}

function newPairKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `pair-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";

/**
 * Photos come off phones at 8–12 MP. They are resized in the browser before
 * upload, which keeps the app usable on a site connection and keeps the volume
 * on Railway small.
 */
const MAX_EDGE = 2200;
const QUALITY = 0.85;

async function downscale(file: File): Promise<Blob> {
  // Leave small files, logos and anything with transparency alone.
  if (file.size < 600_000 || file.type === "image/png" || file.type === "image/webp") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export type UploadedImage = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  originalName: string;
};

export async function uploadImage(file: File): Promise<UploadedImage> {
  const blob = await downscale(file);
  const form = new FormData();
  form.append("file", blob, file.name || "photo.jpg");
  const response = await fetch("/api/upload", { method: "POST", body: form });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "The image could not be uploaded.");
  }
  return response.json();
}

export function ImageUpload({
  label,
  hint,
  fileId,
  onUploaded,
  onCleared,
  aspect = "aspect-4/3",
  multiple = false,
  onManyUploaded,
}: {
  label: string;
  hint?: string;
  fileId?: string | null;
  onUploaded?: (image: UploadedImage) => void;
  onCleared?: () => void;
  aspect?: string;
  multiple?: boolean;
  onManyUploaded?: (images: UploadedImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        if (multiple) {
          const results: UploadedImage[] = [];
          for (const file of Array.from(files)) {
            results.push(await uploadImage(file));
          }
          onManyUploaded?.(results);
        } else {
          onUploaded?.(await uploadImage(files[0]));
        }
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "The image could not be uploaded.",
        );
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [multiple, onManyUploaded, onUploaded],
  );

  return (
    <div>
      <span className="label">{label}</span>
      {fileId ? (
        <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <Image
            src={`/api/files/${fileId}`}
            alt={label}
            width={800}
            height={600}
            className={`w-full object-contain ${aspect}`}
          />
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              className="rounded-md bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </button>
            <button
              type="button"
              className="rounded-md bg-white/95 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-white"
              onClick={() => onCleared?.()}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFiles(event.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
            dragging
              ? "border-slate-500 bg-slate-100"
              : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
          }`}
        >
          {busy ? (
            <span className="text-sm font-medium text-slate-600">Uploading…</span>
          ) : (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="h-7 w-7 text-slate-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                />
              </svg>
              <span className="text-sm font-medium text-slate-600">
                {multiple ? "Add photos" : "Add an image"}
              </span>
              <span className="text-xs text-slate-400">
                Click, or drop {multiple ? "files" : "a file"} here
              </span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      {hint ? <p className="hint">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}

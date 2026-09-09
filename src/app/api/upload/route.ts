import { NextResponse } from "next/server";
import { saveUpload, UploadError } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was received." }, { status: 400 });
    }
    const saved = await saveUpload(file);
    return NextResponse.json({
      id: saved.id,
      url: `/api/files/${saved.id}`,
      width: saved.width,
      height: saved.height,
      originalName: saved.originalName,
    });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Upload failed", error);
    return NextResponse.json(
      { error: "The upload could not be saved. Please try again." },
      { status: 500 },
    );
  }
}

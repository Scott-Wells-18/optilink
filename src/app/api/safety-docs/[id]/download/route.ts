import { NextResponse } from "next/server";
import JSZip from "jszip";
import { notFound, pdfResponse, serverError } from "@/lib/api";
import { buildSafetyDocs } from "@/lib/safety/build";

export const runtime = "nodejs";

/**
 * The finished paperwork.
 *
 * One document comes down on its own; several come down as a zip, because a
 * browser will only accept one file from one click and a SWMS without its JSA
 * is half the job.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const built = await buildSafetyDocs(id);
    if (!built) return notFound("That paperwork could not be found.");
    if (built.length === 0) {
      return NextResponse.json(
        { error: "No documents have been chosen for this job yet." },
        { status: 400 },
      );
    }

    if (built.length === 1) {
      const only = built[0];
      const extension = only.mimeType.includes("word") ? "docx" : "pdf";
      if (extension === "pdf") return pdfResponse(only.bytes, `${only.name}.pdf`);
      return file(only.bytes, `${only.name}.docx`, only.mimeType);
    }

    const zip = new JSZip();
    for (const one of built) {
      const extension = one.mimeType.includes("word") ? "docx" : "pdf";
      zip.file(`${one.name}.${extension}`, one.bytes, { createFolders: false });
    }
    const bytes: Buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return file(bytes, `${built[0].name.split(" - ").slice(1).join(" - ")} paperwork.zip`, "application/zip");
  } catch (error) {
    return serverError(error, "That paperwork could not be built.");
  }
}

function file(bytes: Buffer, name: string, mimeType: string) {
  const plain = name.replace(/[^\w .\-()]+/g, " ").replace(/\s+/g, " ").trim();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": mimeType,
      "content-length": String(bytes.byteLength),
      "content-disposition": `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    },
  });
}

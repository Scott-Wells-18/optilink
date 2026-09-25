import JSZip from "jszip";
import { NextResponse } from "next/server";
import { notFound, fileResponse, serverError } from "@/lib/api";
import { buildSafetyDocs } from "@/lib/safety/build";

export const runtime = "nodejs";

/**
 * The finished paperwork.
 *
 * Every document comes back in the format it was released in, because that is
 * the document that was approved: a SWMS is a PDF, a JSA is a PDF or a Word
 * file depending on which one it is, and OEC-WHS002 is Word so it can still be
 * completed and signed on site. Converting any of them would mean redrawing
 * it, and a redrawn controlled document is a different document.
 *
 * So a set comes back as a zip, one file per document, named for the job. A
 * set of one comes back as that file on its own, and `?only=SWMS014` fetches
 * one out of a set.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const built = await buildSafetyDocs(id);
    if (!built) return notFound("That paperwork could not be found.");
    if (built.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nothing could be built for this job yet. Answer the questions so the documents can be chosen, and check the template library has been fetched.",
        },
        { status: 400 },
      );
    }

    const only = new URL(request.url).searchParams.get("only");
    if (only) {
      const wanted = built.find((one) => one.name.startsWith(`${only} `));
      if (!wanted) return notFound("That document is not part of this job.");
      return fileResponse(wanted.bytes, wanted.name, wanted.mimeType);
    }

    if (built.length === 1) {
      return fileResponse(built[0].bytes, built[0].name, built[0].mimeType);
    }

    const zip = new JSZip();
    for (const one of built) zip.file(one.name, one.bytes);
    const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    // "… - Transdev John Holland - 2026-09-25.pdf" → the job's own tail.
    const tail = built[0].name.replace(/\.[^.]+$/, "").split(" - ").slice(1).join(" - ");
    return fileResponse(bytes, `Safe work paperwork - ${tail}.zip`, "application/zip");
  } catch (error) {
    return serverError(error, "That paperwork could not be built.");
  }
}

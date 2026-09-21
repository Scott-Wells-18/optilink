import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { notFound, pdfResponse, serverError } from "@/lib/api";
import { buildSafetyDocs } from "@/lib/safety/build";

export const runtime = "nodejs";

/**
 * The finished paperwork, as one PDF.
 *
 * A browser will only take one file from one click, and a zip holding a Word
 * document is not what anyone wants to receive on a phone on site. So every
 * document is a PDF and they are bound into a single file, in the order they
 * are meant to be read — the SWMS, then the JSA behind it. One tap, one file,
 * ready to forward.
 *
 * `?only=SWMS014` fetches one of them on its own.
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
      return pdfResponse(wanted.bytes, `${wanted.name}.pdf`);
    }

    if (built.length === 1) return pdfResponse(built[0].bytes, `${built[0].name}.pdf`);

    const merged = await PDFDocument.create();
    for (const one of built) {
      const source = await PDFDocument.load(one.bytes);
      const pages = await merged.copyPages(source, source.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }
    const bytes = Buffer.from(await merged.save());
    const suffix = built[0].name.split(" - ").slice(1).join(" - ");
    return pdfResponse(bytes, `Safe work paperwork - ${suffix}.pdf`);
  } catch (error) {
    return serverError(error, "That paperwork could not be built.");
  }
}

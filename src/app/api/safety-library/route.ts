import { NextResponse } from "next/server";
import { serverError } from "@/lib/api";
import { importLibrary, libraryState } from "@/lib/safety/library";

export const runtime = "nodejs";
/** Fetching eighteen templates takes a while the first time. */
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json(await libraryState());
  } catch (error) {
    return serverError(error, "The template library could not be read.");
  }
}

/** Pulls the templates and signatures in. Safe to run again. */
export async function POST(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("force") === "1";
    const result = await importLibrary(force);
    return NextResponse.json({ ...result, state: await libraryState() });
  } catch (error) {
    return serverError(error, "The templates could not be imported.");
  }
}

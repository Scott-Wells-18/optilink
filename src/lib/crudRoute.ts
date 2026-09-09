import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pickFields, readJson, serverError, type FieldSpec } from "@/lib/api";

type Delegate = {
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  delete: (args: { where: { id: string } }) => Promise<unknown>;
};

type Params = { params: Promise<{ id: string }> };

/**
 * The findings, tests, observations and photos inside a report all patch and
 * delete the same way, so their routes share these handlers.
 */
export function itemHandlers(
  delegate: Delegate,
  fields: Record<string, FieldSpec>,
  label: string,
) {
  return {
    async PATCH(request: Request, { params }: Params) {
      const { id } = await params;
      try {
        const data = pickFields(await readJson(request), fields);
        if (Object.keys(data).length === 0) {
          return NextResponse.json({ ok: true, unchanged: true });
        }
        await delegate.update({ where: { id }, data });
        await touchParent(id, label);
        return NextResponse.json({ ok: true });
      } catch (error) {
        return serverError(error, `That ${label} could not be saved.`);
      }
    },

    async DELETE(_request: Request, { params }: Params) {
      const { id } = await params;
      try {
        await delegate.delete({ where: { id } });
        return NextResponse.json({ ok: true });
      } catch (error) {
        return serverError(error, `That ${label} could not be deleted.`);
      }
    },
  };
}

/**
 * Keeps the parent report's "last saved" time honest when only a child row
 * changed — that timestamp is what the editor shows the user.
 */
async function touchParent(id: string, label: string) {
  try {
    const lookup: Record<string, () => Promise<{ reportId: string } | null>> = {
      finding: () =>
        prisma.thermalFinding.findUnique({ where: { id }, select: { reportId: true } }),
      "RCD test": () =>
        prisma.rcdTest.findUnique({ where: { id }, select: { reportId: true } }),
      observation: () =>
        prisma.observation.findUnique({ where: { id }, select: { reportId: true } }),
      photo: () => prisma.photo.findUnique({ where: { id }, select: { reportId: true } }),
    };
    const row = await lookup[label]?.();
    if (row) {
      await prisma.report.update({
        where: { id: row.reportId },
        data: { updatedAt: new Date() },
      });
    }
  } catch {
    // A failed timestamp refresh must not fail the user's save.
  }
}

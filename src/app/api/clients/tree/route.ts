import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * The whole clients → sites → equipment tree, oldest first at every level,
 * plus each site's inspections. Issues come through without their photos —
 * enough to count them in the tree, and the board loads the rest when opened.
 */
export async function GET() {
  const clients = await prisma.client.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      sites: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          location: true,
          equipment: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              kind: true,
              name: true,
              description: true,
              circuitLoading: true,
              board: true,
              supply: true,
            },
          },
          contacts: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, email: true, phone: true },
          },
          jobs: {
            // Newest first: the report wanted is nearly always the last made.
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: {
              preparedBy: true,
              id: true,
              name: true,
              date: true,
              kind: true,
              contact: { select: { id: true, name: true } },
              items: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  title: true,
                  location: true,
                  found: true,
                  done: true,
                  number: true,
                  // Which stages are covered, so the tree can say what a piece
                  // of work still needs without loading every photo.
                  photos: { select: { stage: true } },
                  _count: { select: { photos: true } },
                },
              },
            },
          },
          rcdReports: {
            // Newest first: the report wanted is nearly always the last made.
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: {
              preparedBy: true,
              id: true,
              name: true,
              date: true,
              contact: { select: { id: true, name: true } },
              instrument: { select: { id: true, name: true } },
              tests: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  name: true,
                  date: true,
                  sourceFileId: true,
                  equipment: { select: { id: true, name: true } },
                  _count: { select: { results: true } },
                },
              },
            },
          },
          powerRuns: {
            // Newest first: the report wanted is nearly always the last made.
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              name: true,
              date: true,
              location: true,
              contact: { select: { id: true, name: true } },
              sourceFileId: true,
              summary: true,
            },
          },
          ampReports: {
            // Newest first: the report wanted is nearly always the last made.
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              name: true,
              date: true,
              location: true,
              recordings: {
                orderBy: { position: "asc" },
                select: { id: true, name: true, rating: true, summary: true },
              },
            },
          },
          gateReports: {
            // Newest first: the report wanted is nearly always the last made.
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              date: true,
              kind: true,
              gateLocation: true,
              assetNumber: true,
              model: true,
              outcome: true,
              completedAt: true,
              technicianId: true,
            },
          },
          tagReports: {
            where: { kind: "CLIENT" },
            // Newest first: the report wanted is nearly always the last made.
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: {
              preparedBy: true,
              id: true,
              name: true,
              date: true,
              customer: true,
              siteLabel: true,
              itemCount: true,
              passCount: true,
              failCount: true,
              reviewCount: true,
              notes: true,
              source: { select: { originalName: true } },
            },
          },
          safetyDocs: {
            // Newest first: the report wanted is nearly always the last made.
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              date: true,
              codes: true,
              projectName: true,
              projectManager: true,
              contactNumber: true,
              jobDescription: true,
              sourceFileId: true,
            },
          },
          inspections: {
            // Newest first: the report wanted is nearly always the last made.
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: {
              preparedBy: true,
              id: true,
              name: true,
              date: true,
              contact: { select: { id: true, name: true } },
              issues: { select: { id: true, equipmentId: true, slot: true, type: true } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json(clients, {
    headers: { "cache-control": "no-store" },
  });
}

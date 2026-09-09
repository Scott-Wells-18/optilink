import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { reportInclude } from "@/lib/report";
import { getSettings } from "@/lib/settings";
import { ReportEditor } from "./ReportEditor";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [report, clients, settings] = await Promise.all([
    prisma.report.findUnique({ where: { id }, include: reportInclude }),
    prisma.client.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, addressLine1: true, suburb: true, state: true, postcode: true },
    }),
    getSettings(),
  ]);

  if (!report) notFound();

  return (
    <ReportEditor
      initialReport={report}
      clients={clients}
      defaults={{
        technicianName: settings.defaultTechnicianName,
        technicianLicence: settings.defaultTechnicianLicence,
      }}
    />
  );
}

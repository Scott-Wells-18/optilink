import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { ClientsManager } from "./ClientsManager";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    include: { _count: { select: { reports: true } } },
  });

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="The people and businesses your reports are written for."
      />
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        <ClientsManager initialClients={clients} />
      </div>
    </>
  );
}

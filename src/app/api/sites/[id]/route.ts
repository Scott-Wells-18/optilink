import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson, serverError } from "@/lib/api";
import { readContacts, type ContactInput } from "@/lib/contacts";

/** Name, location and the people to speak to. Contacts are sent whole. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      name?: string;
      location?: string;
      contacts?: ContactInput[];
    };

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim().slice(0, 180);
    }
    if ("location" in body) {
      data.location = body.location?.trim().slice(0, 300) || null;
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) await tx.site.update({ where: { id }, data });
      if (!body.contacts) return;
      // The dialog edits the whole list at once, so it is replaced whole.
      await tx.contact.deleteMany({ where: { siteId: id } });
      const contacts = readContacts(body.contacts);
      if (contacts.length > 0) {
        await tx.contact.createMany({
          data: contacts.map((contact) => ({ ...contact, siteId: id })),
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "Those changes could not be saved.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    // Contacts, equipment and inspections under the site go with it.
    await prisma.site.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "The site could not be removed.");
  }
}

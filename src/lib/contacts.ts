/** Who to speak to at a site, as the dialog sends them. */
export type ContactInput = { name?: string; email?: string; phone?: string };

export type Contact = { id: string; name: string; email: string | null; phone: string | null };

/** A contact with no name is an empty row someone did not fill in. */
export function readContacts(input: ContactInput[] | undefined) {
  return (input ?? [])
    .filter((contact) => contact?.name?.trim())
    .slice(0, 20)
    .map((contact) => ({
      name: contact.name!.trim().slice(0, 180),
      email: contact.email?.trim().slice(0, 254) || null,
      phone: contact.phone?.trim().slice(0, 60) || null,
    }));
}

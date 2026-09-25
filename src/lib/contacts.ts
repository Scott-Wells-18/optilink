/** Who to speak to at a site, as the dialog sends them. */
export type ContactInput = { name?: string; email?: string; phone?: string };

export type Contact = { id: string; name: string; email: string | null; phone: string | null };

/**
 * The job titles a contact is commonly filed under rather than named.
 *
 * Contacts get typed in as "Site Manager - Dean Mills", with the job in front
 * of the person. A report is addressed to the person, so the job comes off —
 * but only where the leading part really is one of these, so a name that
 * happens to carry a dash is left exactly as it was written.
 */
const ROLES = [
  "site manager",
  "manager",
  "maintenance",
  "maintenance manager",
  "electrical",
  "supervisor",
  "facilities",
  "facilities manager",
  "operations",
  "operations manager",
  "depot manager",
  "engineer",
  "foreman",
  "admin",
  "administration",
  "contact",
  "site contact",
  "owner",
  "builder",
  "project manager",
];

/** "Site Manager - Dean Mills" is Dean Mills. "Dean Mills" is Dean Mills. */
export function personName(name: string): string {
  const parts = name.split(/\s+[-–—]\s+/);
  if (parts.length < 2) return name.trim();
  const [first, ...rest] = parts;
  if (!ROLES.includes(first.trim().toLowerCase())) return name.trim();
  const person = rest.join(" - ").trim();
  return person || name.trim();
}

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

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TreeNode } from "@/lib/navTree";

/**
 * Clients → sites → contacts, loaded from the database and turned into tree
 * nodes. Every list ends with a grey "add new" tile, so a client with no sites
 * still opens to somewhere useful.
 */

type ContactRecord = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type SiteRecord = {
  id: string;
  name: string;
  location: string | null;
  contacts: ContactRecord[];
};

type ClientRecord = { id: string; name: string; sites: SiteRecord[] };

export type DialogField = {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
};

export type DialogSpec = {
  title: string;
  submitLabel: string;
  fields: DialogField[];
  endpoint: string;
  /** Sent alongside the form values, e.g. which client a site belongs to. */
  extra: Record<string, string>;
};

/** `enabled` gates the first load until someone has actually signed in. */
export function useClientsTree(enabled: boolean) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/clients/tree", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setClients(await response.json());
      setError(null);
    } catch {
      setError("Could not load your clients.");
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  const submit = useCallback(
    async (values: Record<string, string>) => {
      if (!dialog) return;
      const response = await fetch(dialog.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...dialog.extra, ...values }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "That could not be saved.");
      }
      await refresh();
      setDialog(null);
    },
    [dialog, refresh],
  );

  const remove = useCallback(
    async (endpoint: string, what: string) => {
      if (!window.confirm(`Remove ${what}? Anything filed under it goes too.`)) return;
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) {
        setError(`${what} could not be removed.`);
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const nodes = useMemo<TreeNode[]>(() => {
    const clientNodes: TreeNode[] = clients.map((client) => ({
      id: `client:${client.id}`,
      label: client.name,
      detail: countLabel(client.sites.length, "site", "sites"),
      onRemove: () => void remove(`/api/clients/${client.id}`, client.name),
      children: [
        ...client.sites.map<TreeNode>((site) => ({
          id: `site:${site.id}`,
          label: site.name,
          detail:
            site.location?.trim() ||
            countLabel(site.contacts.length, "contact", "contacts"),
          onRemove: () => void remove(`/api/sites/${site.id}`, site.name),
          children: [
            ...site.contacts.map<TreeNode>((contact) => ({
              id: `contact:${contact.id}`,
              label: contact.name,
              detail:
                [contact.phone, contact.email].filter(Boolean).join("  ·  ") ||
                undefined,
              onRemove: () => void remove(`/api/contacts/${contact.id}`, contact.name),
            })),
            {
              id: `add:contact:${site.id}`,
              label: "Add new",
              detail: "Manager or contact",
              onActivate: () =>
                setDialog({
                  title: `Add a contact at ${site.name}`,
                  submitLabel: "Add contact",
                  endpoint: "/api/contacts",
                  extra: { siteId: site.id },
                  fields: [
                    { name: "name", label: "Name", required: true, placeholder: "Full name" },
                    { name: "phone", label: "Contact", placeholder: "Phone number" },
                    { name: "email", label: "Email", type: "email", placeholder: "name@company.com.au" },
                  ],
                }),
            },
          ],
        })),
        {
          id: `add:site:${client.id}`,
          label: "Add new",
          detail: "Site",
          onActivate: () =>
            setDialog({
              title: `Add a site for ${client.name}`,
              submitLabel: "Add site",
              endpoint: "/api/sites",
              extra: { clientId: client.id },
              fields: [
                { name: "name", label: "Site name", required: true, placeholder: "e.g. Warehouse 3" },
                { name: "location", label: "Site location", placeholder: "e.g. 22 Industry Way, Botany" },
              ],
            }),
        },
      ],
    }));

    clientNodes.push({
      id: "add:client",
      label: "Add new",
      detail: "Client",
      onActivate: () =>
        setDialog({
          title: "Add a client",
          submitLabel: "Add client",
          endpoint: "/api/clients",
          extra: {},
          fields: [
            {
              name: "name",
              label: "Client name",
              required: true,
              placeholder: "Business or property owner",
            },
          ],
        }),
    });

    return clientNodes;
  }, [clients, remove]);

  return {
    nodes,
    dialog,
    closeDialog: () => setDialog(null),
    submit,
    error,
  };
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

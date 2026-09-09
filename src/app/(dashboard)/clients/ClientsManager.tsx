"use client";

import Link from "next/link";
import { useState } from "react";
import type { Client } from "@prisma/client";
import { TextArea, TextField } from "@/components/fields";
import { EmptyState } from "@/components/PageHeader";
import { sendPatch, useDebouncedPatch } from "@/components/saving";

type ClientRow = Client & { _count: { reports: number } };

export function ClientsManager({ initialClients }: { initialClients: ClientRow[] }) {
  const [clients, setClients] = useState(initialClients);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  async function addClient(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    const response = await sendPatch("/api/clients", { name: newName.trim() }, "POST");
    if (response) {
      const created = (await response.json()) as Client;
      setClients((current) =>
        [...current, { ...created, _count: { reports: 0 } }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setOpenId(created.id);
      setNewName("");
    }
    setBusy(false);
  }

  async function removeClient(client: ClientRow) {
    const message =
      client._count.reports > 0
        ? `${client.name} has ${client._count.reports} report(s). They will be archived rather than deleted so the reports keep their details. Continue?`
        : `Delete ${client.name}?`;
    if (!window.confirm(message)) return;
    const response = await sendPatch(`/api/clients/${client.id}`, null, "DELETE");
    if (response) setClients((current) => current.filter((row) => row.id !== client.id));
  }

  return (
    <div className="space-y-5">
      <form onSubmit={addClient} className="card flex flex-wrap items-end gap-3 p-4">
        <TextField
          label="Add a client"
          value={newName}
          onChange={setNewName}
          placeholder="Business or property owner name"
          className="min-w-64 flex-1"
        />
        <button type="submit" className="btn-primary" disabled={busy || !newName.trim()}>
          Add client
        </button>
      </form>

      {clients.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Add a client above. Their details get pulled onto every report you write for them."
        />
      ) : (
        <div className="space-y-3">
          {clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              open={openId === client.id}
              onToggle={() => setOpenId(openId === client.id ? null : client.id)}
              onDelete={() => removeClient(client)}
              onRename={(name) =>
                setClients((current) =>
                  current.map((row) => (row.id === client.id ? { ...row, name } : row)),
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientCard({
  client,
  open,
  onToggle,
  onDelete,
  onRename,
}: {
  client: ClientRow;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const { patch } = useDebouncedPatch(`/api/clients/${client.id}`);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {client.name || "Unnamed client"}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {[client.suburb, client.state].filter(Boolean).join(" ") || "No address on file"}
            {" · "}
            {client._count.reports} {client._count.reports === 1 ? "report" : "reports"}
          </span>
        </button>
        {client._count.reports > 0 ? (
          <Link href={`/reports?client=${client.id}`} className="btn-ghost text-xs">
            View reports
          </Link>
        ) : null}
        <button type="button" onClick={onToggle} className="btn-secondary text-xs">
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open ? (
        <div className="grid gap-4 border-t border-slate-200 bg-slate-50/60 px-5 py-5 sm:grid-cols-2">
          <TextField
            label="Client name"
            value={client.name}
            onChange={(value) => {
              onRename(value);
              patch({ name: value });
            }}
          />
          <TextField
            label="Contact person"
            value={client.contactName ?? ""}
            onChange={(value) => patch({ contactName: value })}
          />
          <TextField
            label="Email"
            type="email"
            value={client.email ?? ""}
            onChange={(value) => patch({ email: value })}
          />
          <TextField
            label="Phone"
            value={client.phone ?? ""}
            onChange={(value) => patch({ phone: value })}
          />
          <TextField
            label="Address line 1"
            value={client.addressLine1 ?? ""}
            onChange={(value) => patch({ addressLine1: value })}
          />
          <TextField
            label="Address line 2"
            value={client.addressLine2 ?? ""}
            onChange={(value) => patch({ addressLine2: value })}
          />
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <TextField
              label="Suburb"
              value={client.suburb ?? ""}
              onChange={(value) => patch({ suburb: value })}
            />
            <TextField
              label="State"
              value={client.state ?? ""}
              onChange={(value) => patch({ state: value })}
            />
            <TextField
              label="Postcode"
              value={client.postcode ?? ""}
              onChange={(value) => patch({ postcode: value })}
            />
          </div>
          <TextArea
            label="Notes"
            className="sm:col-span-2"
            rows={3}
            value={client.notes ?? ""}
            onChange={(value) => patch({ notes: value })}
            placeholder="Site access, switchboard locations, who to call — anything worth remembering next visit."
          />
          <div className="sm:col-span-2">
            <button type="button" onClick={onDelete} className="btn-danger text-xs">
              {client._count.reports > 0 ? "Archive client" : "Delete client"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TreeNode } from "@/lib/navTree";
import { createBoard, describeBoard, normaliseBoard, type Board } from "@/lib/board";

/**
 * Clients → sites → contacts, loaded from the database and turned into tree
 * nodes. Every list ends with a grey "add new" tile, so a client with no sites
 * still opens to somewhere useful.
 */

type EquipmentRecord = {
  id: string;
  kind: "SWITCHBOARD" | "APPLIANCE";
  name: string;
  description: string | null;
  board: unknown;
};

type SiteRecord = {
  id: string;
  name: string;
  location: string | null;
  equipment: EquipmentRecord[];
};

type ClientRecord = { id: string; name: string; sites: SiteRecord[] };

export type DialogField = {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  multiline?: boolean;
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
/** A read-only panel, used to reveal an item's description. */
export type InfoSpec = { title: string; body: string | null };

/** Which site is being added to, when the switchboard/appliance choice is up. */
export type ChooserSpec = { siteId: string; siteName: string };

/** Opening the switchboard editor, either on a new board or an existing one. */
export type BoardSpec = {
  title: string;
  name: string;
  board: Board;
  /** Absent when the board has not been created yet. */
  equipmentId?: string;
  siteId: string;
};

export function useClientsTree(enabled: boolean) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [info, setInfo] = useState<InfoSpec | null>(null);
  const [chooser, setChooser] = useState<ChooserSpec | null>(null);
  const [boardEditor, setBoardEditor] = useState<BoardSpec | null>(null);
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

  const equipmentNode = useCallback(
    (item: EquipmentRecord, site: { id: string; name: string }): TreeNode => {
      const isBoard = item.kind === "SWITCHBOARD";
      return {
        id: `equipment:${item.id}`,
        label: item.name,
        detail: isBoard ? describeBoard(normaliseBoard(item.board)) : undefined,
        variant: "info",
        onActivate: () =>
          isBoard
            ? setBoardEditor({
                title: "Switchboard",
                name: item.name,
                board: normaliseBoard(item.board),
                equipmentId: item.id,
                siteId: site.id,
              })
            : setInfo({ title: item.name, body: item.description }),
        onRemove: () => void remove(`/api/equipment/${item.id}`, item.name),
      };
    },
    [remove],
  );

  /** Picked from the chooser: appliances go to a form, boards to the editor. */
  const chooseKind = useCallback(
    (kind: "SWITCHBOARD" | "APPLIANCE") => {
      const site = chooser;
      setChooser(null);
      if (!site) return;

      if (kind === "SWITCHBOARD") {
        setBoardEditor({
          title: "New switchboard",
          name: "",
          board: createBoard(),
          siteId: site.siteId,
        });
        return;
      }

      setDialog({
        title: `Add an appliance at ${site.siteName}`,
        submitLabel: "Add appliance",
        endpoint: "/api/equipment",
        extra: { siteId: site.siteId, kind: "APPLIANCE" },
        fields: [
          { name: "name", label: "Name", required: true, placeholder: "e.g. Rooftop AC unit" },
          {
            name: "description",
            label: "Description",
            multiline: true,
            placeholder: "Anything worth remembering — only shown when this is opened.",
          },
        ],
      });
    },
    [chooser],
  );

  const saveBoard = useCallback(
    async (name: string, board: Board) => {
      if (!boardEditor) return;
      const existing = Boolean(boardEditor.equipmentId);
      const response = await fetch(
        existing ? `/api/equipment/${boardEditor.equipmentId}` : "/api/equipment",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            existing
              ? { name, board }
              : { siteId: boardEditor.siteId, kind: "SWITCHBOARD", name, board },
          ),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "The board could not be saved.");
      }
      await refresh();
      setBoardEditor(null);
    },
    [boardEditor, refresh],
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
            countLabel(site.equipment.length, "item", "items"),
          onRemove: () => void remove(`/api/sites/${site.id}`, site.name),
          children: [
            ...site.equipment.map<TreeNode>((item) => equipmentNode(item, site)),
            {
              id: `add:equipment:${site.id}`,
              label: "Add new",
              detail: "Equipment",
              variant: "add",
              onActivate: () => setChooser({ siteId: site.id, siteName: site.name }),
            },
          ],
        })),
        {
          id: `add:site:${client.id}`,
          label: "Add new",
          detail: "Site",
          variant: "add",
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
      variant: "add",
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
  }, [clients, remove, equipmentNode]);

  /**
   * Thermal works off boards only — appliances never appear here, and nothing
   * is added from this side.
   */
  const thermalNodes = useMemo<TreeNode[]>(
    () =>
      clients
        .map<TreeNode>((client) => ({
          id: `thermal:client:${client.id}`,
          label: client.name,
          detail: countLabel(
            client.sites.reduce(
              (total, site) =>
                total + site.equipment.filter((item) => item.kind === "SWITCHBOARD").length,
              0,
            ),
            "board",
            "boards",
          ),
          children: client.sites
            .map<TreeNode>((site) => ({
              id: `thermal:site:${site.id}`,
              label: site.name,
              detail: site.location?.trim() || undefined,
              children: site.equipment
                .filter((item) => item.kind === "SWITCHBOARD")
                .map((item) => ({
                  ...equipmentNode(item, site),
                  id: `thermal:equipment:${item.id}`,
                  onRemove: undefined,
                })),
            }))
            .filter((site) => (site.children?.length ?? 0) > 0),
        }))
        .filter((client) => (client.children?.length ?? 0) > 0),
    [clients, equipmentNode],
  );

  return {
    nodes,
    thermalNodes,
    dialog,
    closeDialog: () => setDialog(null),
    info,
    closeInfo: () => setInfo(null),
    chooser,
    closeChooser: () => setChooser(null),
    chooseKind,
    boardEditor,
    closeBoardEditor: () => setBoardEditor(null),
    saveBoard,
    submit,
    error,
  };
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

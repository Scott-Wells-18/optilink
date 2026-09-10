"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TreeNode } from "@/lib/navTree";
import { createBoard, describeBoard, normaliseBoard, type Board } from "@/lib/board";
import { MOTOR_SLOT, type IssueType } from "@/lib/issues";
import { usePersisted } from "@/lib/session";

/**
 * Clients → sites → contacts, loaded from the database and turned into tree
 * nodes. Every list ends with a grey "add new" tile, so a client with no sites
 * still opens to somewhere useful.
 */

export type EquipmentKind = "SWITCHBOARD" | "APPLIANCE" | "MOTOR";

type EquipmentRecord = {
  id: string;
  kind: EquipmentKind;
  name: string;
  description: string | null;
  circuitLoading: string | null;
  board: unknown;
};

type IssueRecord = {
  id: string;
  equipmentId: string;
  slot: string;
  type: IssueType;
};

type InspectionRecord = {
  id: string;
  name: string | null;
  /** The day it was carried out, as an ISO date. */
  date: string;
  issues: IssueRecord[];
};

type SiteRecord = {
  id: string;
  name: string;
  location: string | null;
  equipment: EquipmentRecord[];
  inspections: InspectionRecord[];
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
/** Read-only board, opened from an inspection to report issues against it. */
export type ViewerSpec = {
  inspectionId: string;
  equipmentId: string;
  name: string;
  board: Board;
};

/** Reporting straight against a motor, which has no positions to pick from. */
export type MotorIssueSpec = {
  inspectionId: string;
  equipmentId: string;
  slot: string;
  where: string;
};

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
  const [dialog, setDialog] = usePersisted<DialogSpec | null>("dialog", null);
  const [info, setInfo] = usePersisted<InfoSpec | null>("info", null);
  const [chooser, setChooser] = usePersisted<ChooserSpec | null>("chooser", null);
  const [boardEditor, setBoardEditor] = usePersisted<BoardSpec | null>("editor", null);
  const [viewer, setViewer] = usePersisted<ViewerSpec | null>("viewer", null);
  const [motorIssue, setMotorIssue] = usePersisted<MotorIssueSpec | null>("motor", null);
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
            : setInfo({ title: item.name, body: describeItem(item) }),
        onRemove: () => void remove(`/api/equipment/${item.id}`, item.name),
      };
    },
    [remove],
  );

  /** Picked from the chooser: appliances go to a form, boards to the editor. */
  const chooseKind = useCallback(
    (kind: EquipmentKind) => {
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

      const isMotor = kind === "MOTOR";
      setDialog({
        title: isMotor
          ? `Add a motor at ${site.siteName}`
          : `Add an appliance at ${site.siteName}`,
        submitLabel: isMotor ? "Add motor" : "Add appliance",
        endpoint: "/api/equipment",
        extra: { siteId: site.siteId, kind },
        fields: [
          {
            name: "name",
            label: "Name",
            required: true,
            placeholder: isMotor ? "e.g. Supply air fan 1" : "e.g. Rooftop AC unit",
          },
          {
            name: "description",
            label: "Description",
            multiline: true,
            placeholder: "Anything worth remembering — only shown when this is opened.",
          },
          ...(isMotor
            ? [
                {
                  name: "circuitLoading",
                  label: "Circuit loading",
                  placeholder: "e.g. 32 A, or 18.5 kW",
                },
              ]
            : []),
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

  const setInspectionDate = useCallback(
    async (id: string, date: string) => {
      const response = await fetch(`/api/inspections/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!response.ok) {
        setError("The date could not be changed.");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  /** Starting a survey needs no form — today's date names it. */
  const startInspection = useCallback(
    async (siteId: string) => {
      const response = await fetch("/api/inspections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (!response.ok) {
        setError("The inspection could not be started.");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  /**
   * Thermal walks client → site → inspection → equipment. Everything found is
   * filed against an inspection, so the same board can be surveyed in March
   * and again in June without the two runs bleeding into each other.
   *
   * Boards and motors only — an appliance is never thermographed.
   */
  const thermalNodes = useMemo<TreeNode[]>(
    () =>
      clients
        .map<TreeNode>((client) => {
          const sites = client.sites
            .filter((site) => site.equipment.some(inThermal))
            .map<TreeNode>((site) => ({
              id: `thermal:site:${site.id}`,
              label: site.name,
              detail:
                site.location?.trim() ||
                countLabel(site.inspections.length, "inspection", "inspections"),
              children: [
                ...site.inspections.map<TreeNode>((inspection) => {
                  const title = inspectionTitle(inspection);
                  return {
                    id: `inspection:${inspection.id}`,
                    label: title,
                    detail: countLabel(inspection.issues.length, "finding", "findings"),
                    editDate: {
                      value: isoDate(inspection.date),
                      onSave: (value) => void setInspectionDate(inspection.id, value),
                    },
                    onRemove: () =>
                      void remove(`/api/inspections/${inspection.id}`, title),
                    children: site.equipment.filter(inThermal).map((item) => {
                      const found = inspection.issues.filter(
                        (issue) => issue.equipmentId === item.id,
                      ).length;
                      const isBoard = item.kind === "SWITCHBOARD";
                      return {
                        id: `inspection:${inspection.id}:equipment:${item.id}`,
                        label: item.name,
                        detail: found
                          ? countLabel(found, "finding", "findings")
                          : isBoard
                            ? describeBoard(normaliseBoard(item.board))
                            : item.circuitLoading?.trim() || "Motor",
                        variant: "info",
                        onActivate: isBoard
                          ? () =>
                              setViewer({
                                inspectionId: inspection.id,
                                equipmentId: item.id,
                                name: item.name,
                                board: normaliseBoard(item.board),
                              })
                          : () =>
                              setMotorIssue({
                                inspectionId: inspection.id,
                                equipmentId: item.id,
                                slot: MOTOR_SLOT,
                                where: item.name,
                              }),
                      };
                    }),
                  };
                }),
                {
                  id: `add:inspection:${site.id}`,
                  label: "Add new",
                  detail: "Inspection",
                  variant: "add",
                  onActivate: () => void startInspection(site.id),
                },
              ],
            }));

          return {
            id: `thermal:client:${client.id}`,
            label: client.name,
            detail: countLabel(sites.length, "site", "sites"),
            children: sites,
          };
        })
        .filter((client) => (client.children?.length ?? 0) > 0),
    [clients, remove, startInspection, setInspectionDate],
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
    viewer,
    closeViewer: () => {
      setViewer(null);
      void refresh();
    },
    motorIssue,
    closeMotorIssue: () => {
      setMotorIssue(null);
      void refresh();
    },
    submit,
    error,
  };
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Boards and motors get thermal surveys; appliances do not. */
function inThermal(item: EquipmentRecord): boolean {
  return item.kind === "SWITCHBOARD" || item.kind === "MOTOR";
}

/** What the info panel shows for an appliance or a motor. */
function describeItem(item: EquipmentRecord): string | null {
  const parts = [item.description?.trim()].filter(Boolean) as string[];
  if (item.circuitLoading?.trim()) {
    parts.push(`Circuit loading: ${item.circuitLoading.trim()}`);
  }
  return parts.join("\n\n") || null;
}

/** A survey is named by hand, or else by the day it was carried out. */
function inspectionTitle(inspection: { name: string | null; date: string }): string {
  return (
    inspection.name?.trim() ||
    new Date(inspection.date).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
  );
}

/** "2026-09-10" — what a date input expects, and what the API takes back. */
function isoDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

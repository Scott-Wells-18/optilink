"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TreeNode } from "@/lib/navTree";
import { createBoard, describeBoard, normaliseBoard, type Board } from "@/lib/board";
import { MOTOR_SLOT, type IssueType } from "@/lib/issues";
import { usePersisted } from "@/lib/session";
import type { Contact, ContactInput } from "@/lib/contacts";

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

type JobItemRecord = {
  id: string;
  title: string;
  location: string;
  found: string;
  done: string;
  _count: { photos: number };
};

type JobRecord = {
  id: string;
  name: string | null;
  /** The day the work was done, as an ISO date. */
  date: string;
  items: JobItemRecord[];
};

type RcdRunRecord = {
  id: string;
  name: string | null;
  date: string;
  sourceFileId: string | null;
  equipment: { id: string; name: string } | null;
  _count: { results: number };
};

type SiteRecord = {
  id: string;
  name: string;
  location: string | null;
  equipment: EquipmentRecord[];
  contacts: Contact[];
  inspections: InspectionRecord[];
  jobs: JobRecord[];
  rcdRuns: RcdRunRecord[];
};

type ClientRecord = { id: string; name: string; sites: SiteRecord[] };

export type DialogField = {
  name: string;
  label: string;
  /** Filled in when the form is opened to change something. */
  value?: string;
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
  /** POST to create, PATCH to change something that is already there. */
  method?: "POST" | "PATCH";
  /** Sent alongside the form values, e.g. which client a site belongs to. */
  extra: Record<string, string>;
  /** Present on the site form: the people to speak to, edited in place. */
  contacts?: ContactInput[];
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

/** The RCD wizard, opened on one test run. */
export type RcdSpec = { runId: string; siteName: string };

/** Adding one piece of work to a job. */
export type JobItemSpec = { jobId: string; jobTitle: string };

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
  const [jobItem, setJobItem] = usePersisted<JobItemSpec | null>("jobitem", null);
  const [rcd, setRcd] = usePersisted<RcdSpec | null>("rcd", null);
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
    async (values: Record<string, unknown>) => {
      if (!dialog) return;
      const response = await fetch(dialog.endpoint, {
        method: dialog.method ?? "POST",
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
          onEdit: () =>
            setDialog({
              title: site.name,
              submitLabel: "Save site",
              endpoint: `/api/sites/${site.id}`,
              method: "PATCH",
              extra: {},
              contacts: site.contacts.map((contact) => ({
                name: contact.name,
                email: contact.email ?? "",
                phone: contact.phone ?? "",
              })),
              fields: SITE_FIELDS.map((field) => ({
                ...field,
                value: field.name === "name" ? site.name : site.location ?? "",
              })),
            }),
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
              contacts: [],
              fields: SITE_FIELDS,
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
                    onDownload: () => downloadReport(inspection.id),
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

  const setJobDate = useCallback(
    async (id: string, date: string) => {
      const response = await fetch(`/api/jobs/${id}`, {
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

  /** Starting a job needs no form either — today's date names it. */
  const startJob = useCallback(
    async (siteId: string) => {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (!response.ok) {
        setError("The job could not be started.");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  /**
   * Before & after walks client → site → job → the work done. A job is a day
   * at a site; each item under it is one discrete piece of work, photographed
   * as it was found and as it was left.
   */
  const baNodes = useMemo<TreeNode[]>(
    () =>
      clients
        .map<TreeNode>((client) => {
          const sites = client.sites.map<TreeNode>((site) => ({
            id: `ba:site:${site.id}`,
            label: site.name,
            detail:
              site.location?.trim() || countLabel(site.jobs.length, "job", "jobs"),
            children: [
              ...site.jobs.map<TreeNode>((job) => {
                const title = jobTitle(job);
                return {
                  id: `job:${job.id}`,
                  label: title,
                  detail: countLabel(job.items.length, "item", "items"),
                  editDate: {
                    value: isoDate(job.date),
                    onSave: (value) => void setJobDate(job.id, value),
                  },
                  onDownload: () => openInTab(`/api/jobs/${job.id}/report`),
                  onRemove: () => void remove(`/api/jobs/${job.id}`, title),
                  children: [
                    ...job.items.map<TreeNode>((item) => ({
                      id: `jobitem:${item.id}`,
                      label: item.title,
                      detail: `${item.location}  ·  ${countLabel(
                        item._count.photos,
                        "photo",
                        "photos",
                      )}`,
                      variant: "info",
                      onActivate: () =>
                        setInfo({
                          title: item.title,
                          body: `${item.location}\n\nFound\n${item.found}\n\nDone\n${item.done}`,
                        }),
                      onRemove: () => void remove(`/api/job-items/${item.id}`, item.title),
                    })),
                    {
                      id: `add:jobitem:${job.id}`,
                      label: "Add new",
                      detail: "Work done",
                      variant: "add",
                      onActivate: () => setJobItem({ jobId: job.id, jobTitle: title }),
                    },
                  ],
                };
              }),
              {
                id: `add:job:${site.id}`,
                label: "Add new",
                detail: "Job",
                variant: "add",
                onActivate: () => void startJob(site.id),
              },
            ],
          }));

          return {
            id: `ba:client:${client.id}`,
            label: client.name,
            detail: countLabel(sites.length, "site", "sites"),
            children: sites,
          };
        })
        .filter((client) => (client.children?.length ?? 0) > 0),
    [clients, remove, startJob, setJobDate, setJobItem, setInfo],
  );

  const setRcdDate = useCallback(
    async (id: string, date: string) => {
      const response = await fetch(`/api/rcd-tests/${id}`, {
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

  const startRcdTest = useCallback(
    async (siteId: string) => {
      const response = await fetch("/api/rcd-tests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (!response.ok) {
        setError("The test could not be started.");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  /**
   * RCD walks client → site → test. A test is a round of testing on one
   * board: the instrument's export goes in, the corrections are made, and a
   * report comes out.
   */
  const rcdNodes = useMemo<TreeNode[]>(
    () =>
      clients
        .map<TreeNode>((client) => {
          const sites = client.sites.map<TreeNode>((site) => ({
            id: `rcd:site:${site.id}`,
            label: site.name,
            detail:
              site.location?.trim() || countLabel(site.rcdRuns.length, "test", "tests"),
            children: [
              ...site.rcdRuns.map<TreeNode>((run) => {
                const title = run.name?.trim() || isoLabel(run.date);
                const done = run._count.results > 0;
                return {
                  id: `rcdrun:${run.id}`,
                  label: title,
                  detail: done
                    ? `${run.equipment?.name ?? "Board"}  ·  ${countLabel(
                        run._count.results,
                        "device",
                        "devices",
                      )}`
                    : run.sourceFileId
                      ? "Corrections not finished"
                      : "No export loaded yet",
                  variant: "info",
                  editDate: {
                    value: isoDate(run.date),
                    onSave: (value) => void setRcdDate(run.id, value),
                  },
                  onActivate: () => setRcd({ runId: run.id, siteName: site.name }),
                  onDownload: done
                    ? () => openInTab(`/api/rcd-tests/${run.id}/report`)
                    : undefined,
                  onRemove: () => void remove(`/api/rcd-tests/${run.id}`, title),
                };
              }),
              {
                id: `add:rcd:${site.id}`,
                label: "Add new",
                detail: "Test",
                variant: "add",
                onActivate: () => void startRcdTest(site.id),
              },
            ],
          }));

          return {
            id: `rcd:client:${client.id}`,
            label: client.name,
            detail: countLabel(sites.length, "site", "sites"),
            children: sites,
          };
        })
        .filter((client) => (client.children?.length ?? 0) > 0),
    [clients, remove, startRcdTest, setRcdDate, setRcd],
  );

  return {
    nodes,
    thermalNodes,
    baNodes,
    rcdNodes,
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
    jobItem,
    closeJobItem: () => {
      setJobItem(null);
      void refresh();
    },
    rcd,
    closeRcd: () => {
      setRcd(null);
      void refresh();
    },
    submit,
    error,
  };
}

/**
 * The report comes back as a file, so the browser is handed the URL rather
 * than the bytes — it saves it the same way it would any other download.
 */
function downloadReport(inspectionId: string) {
  openInTab(`/api/inspections/${inspectionId}/report`);
}

function openInTab(url: string) {
  window.open(url, "_blank", "noopener");
}

const SITE_FIELDS: DialogField[] = [
  { name: "name", label: "Site name", required: true, placeholder: "e.g. Warehouse 3" },
  {
    name: "location",
    label: "Site location",
    placeholder: "e.g. 22 Industry Way, Botany",
  },
];

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

/** A date on its own, for rows that carry no name. */
function isoLabel(value: string): string {
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A job is named by hand, or else by the day the work was done. */
function jobTitle(job: { name: string | null; date: string }): string {
  return (
    job.name?.trim() ||
    new Date(job.date).toLocaleDateString("en-AU", {
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

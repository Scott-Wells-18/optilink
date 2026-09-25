"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TreeNode } from "@/lib/navTree";
import {
  createBoard,
  createFreeBoard,
  describeBoard,
  normaliseBoard,
  type Board,
} from "@/lib/board";
import { MOTOR_SLOT, type IssueType } from "@/lib/issues";
import { missingReads, whatIsMissing, type JobPhotoStage } from "@/lib/jobs";
import { usePersisted } from "@/lib/session";
import { personName, type Contact, type ContactInput } from "@/lib/contacts";
import { EMPTY_EQUIPMENT, type EquipmentDraft } from "@/components/EquipmentDialog";
import type { ContactChoice } from "@/components/ReportContactDialog";
import { EMPTY_SUPPLY, normaliseSupply, type Supply } from "@/lib/supply";

/**
 * Clients → sites → contacts, loaded from the database and turned into tree
 * nodes. Every list ends with a grey "add new" tile, so a client with no sites
 * still opens to somewhere useful.
 */

export type EquipmentKind = "SWITCHBOARD" | "APPLIANCE" | "MOTOR";

/**
 * What the chooser offers. A board can be drawn two ways — as a grid of
 * numbered ways, or freehand for the older boards that are not a grid — and
 * both are saved as SWITCHBOARD equipment.
 */
export type ChosenKind = EquipmentKind | "SWITCHBOARD_FREE";

type EquipmentRecord = {
  id: string;
  kind: EquipmentKind;
  name: string;
  description: string | null;
  circuitLoading: string | null;
  board: unknown;
  supply: unknown;
};

type IssueRecord = {
  id: string;
  equipmentId: string;
  slot: string;
  type: IssueType;
};

/** Whoever the report is addressed to, where one has been picked. */
type NamedContact = { id: string; name: string } | null;

type InspectionRecord = {
  id: string;
  name: string | null;
  /** The day it was carried out, as an ISO date. */
  date: string;
  contact: NamedContact;
  issues: IssueRecord[];
};

type JobItemRecord = {
  id: string;
  title: string;
  location: string;
  found: string;
  done: string;
  /** Which stages are covered, for working out whether it is finished. */
  photos: { stage: JobPhotoStage }[];
  _count: { photos: number };
};

type JobRecord = {
  id: string;
  name: string | null;
  /** The day the work was done, as an ISO date. */
  date: string;
  contact: NamedContact;
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

/** One visit's report, holding however many switchboards were tested on it. */
type RcdReportRecord = {
  id: string;
  name: string | null;
  date: string;
  contact: NamedContact;
  instrument: { id: string; name: string } | null;
  tests: RcdRunRecord[];
};

type PowerRunRecord = {
  id: string;
  name: string | null;
  date: string;
  location: string | null;
  contact: NamedContact;
  sourceFileId: string | null;
  summary: {
    from: number;
    to: number;
    count: number;
    highest: { channel: string; amps: number } | null;
  } | null;
};

type SafetyDocRecord = {
  id: string;
  date: string;
  codes: string[];
  projectName: string | null;
  projectManager: string | null;
  contactNumber: string | null;
  jobDescription: string | null;
  sourceFileId: string | null;
};

type SiteRecord = {
  id: string;
  name: string;
  location: string | null;
  equipment: EquipmentRecord[];
  contacts: Contact[];
  inspections: InspectionRecord[];
  jobs: JobRecord[];
  rcdReports: RcdReportRecord[];
  safetyDocs: SafetyDocRecord[];
  powerRuns: PowerRunRecord[];
};

type ClientRecord = { id: string; name: string; sites: SiteRecord[] };

/** A piece of our own test gear, as the Equipment section lists it. */
type TestEquipmentRecord = {
  id: string;
  name: string;
  serialNo: string | null;
  modelNo: string | null;
  certFile: { id: string; originalName: string } | null;
  photoFile: { id: string; originalName: string } | null;
  calibratedOn: string | null;
  expiresOn: string | null;
};

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

/** Choosing which instrument a visit's boards were tested with. */
export type RcdInstrumentSpec = { reportId: string; instrumentId: string | null };

/** One power analysis, opened to load its recording. */
export type PowerSpec = { runId: string; siteName: string };

/** One set of safe work paperwork, opened to be answered. */
export type SafetySpec = {
  docId: string;
  clientName: string;
  siteName: string;
  siteLocation: string | null;
  contacts: { name: string; phone: string | null }[];
};

/** Adding one piece of work to a job. */
export type JobItemSpec = {
  jobId: string;
  jobTitle: string;
  /** Set when an unfinished piece of work is being picked back up. */
  itemId?: string;
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
  /** What feeds it, where that has been recorded against the board before. */
  supply: Supply;
  /** The other boards at this site, which this one may be fed from. */
  siblings: { id: string; name: string }[];
  /** Absent when the board has not been created yet. */
  equipmentId?: string;
  siteId: string;
};

/**
 * The row under a report that says who it is addressed to.
 *
 * Kept as a row of the report rather than asked once for the site, because a
 * thermal survey and the works that followed it can perfectly well be for two
 * different people at the same depot.
 */
function contactRow(
  key: string,
  path: string,
  what: string,
  contact: NamedContact,
  contacts: Contact[],
  open: (choice: ContactChoice) => void,
): TreeNode {
  return {
    id: `contact:${key}`,
    label: contact ? personName(contact.name) : "Report contact",
    detail: contact ? "Change who the report is for" : "Not chosen yet",
    variant: "info",
    onActivate: () =>
      open({
        path,
        what,
        contacts: contacts.map((entry) => ({ id: entry.id, name: entry.name })),
        contactId: contact?.id ?? null,
      }),
  };
}

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
  const [safety, setSafety] = usePersisted<SafetySpec | null>("safety", null);
  const [rcdLimits, setRcdLimits] = usePersisted("rcdlimits", false);
  const [power, setPower] = usePersisted<PowerSpec | null>("power", null);
  const [rcdInstrument, setRcdInstrument] = usePersisted<RcdInstrumentSpec | null>(
    "rcdgear",
    null,
  );
  const [contact, setContact] = usePersisted<ContactChoice | null>("contact", null);
  const [testGear, setTestGear] = useState<TestEquipmentRecord[]>([]);
  const [gearDialog, setGearDialog] = usePersisted<EquipmentDraft | null>("gear", null);
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

  /** Our own test gear is a flat list of its own, not part of the client tree. */
  const refreshGear = useCallback(async () => {
    try {
      const response = await fetch("/api/test-equipment", { cache: "no-store" });
      if (!response.ok) return;
      setTestGear(await response.json());
    } catch {
      // The section shows what it has; a failed refresh is not worth a banner.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    void refreshGear();
  }, [enabled, refresh, refreshGear]);

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

  /**
   * The switchboards at each site, by site id.
   *
   * A board's feed points at another board rather than at a typed name, so the
   * editor has to be handed the list it may choose from — and the same list
   * turns an id back into a name wherever a feed is shown.
   */
  const boardsBySite = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const client of clients) {
      for (const site of client.sites) {
        map.set(
          site.id,
          site.equipment
            .filter((item) => item.kind === "SWITCHBOARD")
            .map((item) => ({ id: item.id, name: item.name })),
        );
      }
    }
    return map;
  }, [clients]);

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
                supply: normaliseSupply(item.supply),
                // Never itself: a board cannot be its own supply.
                siblings: (boardsBySite.get(site.id) ?? []).filter(
                  (board) => board.id !== item.id,
                ),
                equipmentId: item.id,
                siteId: site.id,
              })
            : setInfo({ title: item.name, body: describeItem(item) }),
        onRemove: () => void remove(`/api/equipment/${item.id}`, item.name),
      };
    },
    [remove, boardsBySite],
  );

  /** Picked from the chooser: appliances go to a form, boards to the editor. */
  const chooseKind = useCallback(
    (kind: ChosenKind) => {
      const site = chooser;
      setChooser(null);
      if (!site) return;

      if (kind === "SWITCHBOARD" || kind === "SWITCHBOARD_FREE") {
        setBoardEditor({
          title:
            kind === "SWITCHBOARD_FREE" ? "New custom switchboard" : "New switchboard",
          name: "",
          board: kind === "SWITCHBOARD_FREE" ? createFreeBoard() : createBoard(),
          supply: EMPTY_SUPPLY,
          siblings: boardsBySite.get(site.siteId) ?? [],
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
    async (name: string, board: Board, supply: Supply) => {
      if (!boardEditor) return;
      const existing = Boolean(boardEditor.equipmentId);
      const response = await fetch(
        existing ? `/api/equipment/${boardEditor.equipmentId}` : "/api/equipment",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            existing
              ? { name, board, supply }
              : { siteId: boardEditor.siteId, kind: "SWITCHBOARD", name, board, supply },
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
          const sites = client.sites.map<TreeNode>((site) => {
            const surveyable = site.equipment.filter(inThermal);
            return {
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
                    children: [
                      ...(surveyable.length > 0
                        ? surveyable.map<TreeNode>((item) => {
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
                          })
                        : // An inspection can be started anywhere; there is just
                          // nothing to point the camera at until the site has a
                          // board or a motor drawn up under Clients.
                          ([
                            {
                              id: `inspection:${inspection.id}:nothing`,
                              label: "Nothing to survey yet",
                              detail: "No switchboards or motors",
                              variant: "info",
                              onActivate: () =>
                                setInfo({
                                  title: site.name,
                                  body: "This site has no switchboards or motors on it yet, so there is nothing an inspection can be filed against.\n\nAdd them under Clients, then come back — they will appear under every inspection at this site.",
                                }),
                            },
                          ] as TreeNode[])),
                      contactRow(
                        `inspection:${inspection.id}`,
                        `/api/inspections/${inspection.id}`,
                        "thermal report",
                        inspection.contact,
                        site.contacts,
                        setContact,
                      ),
                    ],
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
            };
          });

          return {
            id: `thermal:client:${client.id}`,
            label: client.name,
            detail: countLabel(sites.length, "site", "sites"),
            children: sites,
          };
        })
        // A client with no sites at all has nothing to open, here or anywhere
        // else in the app. Every site they do have is shown, whether or not
        // anything on it has been drawn up yet.
        .filter((client) => (client.children?.length ?? 0) > 0),
    [clients, remove, startInspection, setInspectionDate, setInfo, setContact],
  );

  /**
   * A piece of work dragged into a different place in the list.
   *
   * The order is the report's: the list on its front page, its summary and the
   * numbered sections all read off it, and an item's photographs and
   * descriptions travel with it because they belong to the item rather than to
   * the place it sat in.
   *
   * Moved here first and saved after, so the list follows the hand rather than
   * the round trip. A save that fails puts the server's order back.
   */
  const moveJobItem = useCallback(
    async (jobId: string, fromId: string, toId: string) => {
      if (fromId === toId) return;

      let ordered: string[] = [];
      setClients((current) =>
        current.map((client) => ({
          ...client,
          sites: client.sites.map((site) => ({
            ...site,
            jobs: site.jobs.map((job) => {
              if (job.id !== jobId) return job;
              const items = [...job.items];
              const from = items.findIndex((item) => item.id === fromId);
              const to = items.findIndex((item) => item.id === toId);
              if (from < 0 || to < 0) return job;
              const [moved] = items.splice(from, 1);
              items.splice(to, 0, moved);
              ordered = items.map((item) => item.id);
              return { ...job, items };
            }),
          })),
        })),
      );
      if (ordered.length === 0) return;

      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemOrder: ordered }),
      });
      if (!response.ok) {
        setError("That order could not be saved.");
        await refresh();
      }
    },
    [refresh],
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

  /** Starting a report needs no form either — today's date names it. */
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
   * Before & after walks client → site → report → the work done.
   *
   * A report is not a job. It is whatever you want to hand the client as one
   * document: a single GPO replacement, a week of call-outs, or twenty
   * switchboards cleaned on the one visit. Each item under it is one discrete
   * piece of work, photographed as it was found and as it was left.
   */
  const baNodes = useMemo<TreeNode[]>(
    () =>
      clients
        .map<TreeNode>((client) => {
          const sites = client.sites.map<TreeNode>((site) => ({
            id: `ba:site:${site.id}`,
            label: site.name,
            detail:
              site.location?.trim() ||
              countLabel(site.jobs.length, "report", "reports"),
            children: [
              ...site.jobs.map<TreeNode>((job) => {
                const title = jobTitle(job);
                return {
                  id: `job:${job.id}`,
                  label: title,
                  detail: (() => {
                    const unfinished = job.items.filter(
                      (item) => whatIsMissing(item).length > 0,
                    ).length;
                    const all = countLabel(job.items.length, "item", "items");
                    return unfinished > 0 ? `${all}  ·  ${unfinished} unfinished` : all;
                  })(),
                  editDate: {
                    value: isoDate(job.date),
                    onSave: (value) => void setJobDate(job.id, value),
                  },
                  onDownload: () => download(`/api/jobs/${job.id}/report`),
                  onRemove: () => void remove(`/api/jobs/${job.id}`, title),
                  children: [
                    ...job.items.map<TreeNode>((item) => {
                      // A job is done and written up at different times, so a
                      // piece of work can sit here unfinished. It says what it
                      // is short of, and opening it picks it back up.
                      const missing = whatIsMissing(item);
                      const name = item.title.trim() || "Unfinished work";
                      return {
                        id: `jobitem:${item.id}`,
                        label: missing.length > 0 ? `${name}  \u2014  unfinished` : name,
                        detail:
                          missing.length > 0
                            ? missingReads(missing)
                            : `${item.location}  ·  ${countLabel(
                                item._count.photos,
                                "photo",
                                "photos",
                              )}`,
                        variant: "info" as const,
                        // Finished or not, opening it opens it for editing:
                        // a photograph of the wrong board or a sentence that
                        // reads badly is found after the work is written up
                        // as often as before it.
                        onActivate: () =>
                          setJobItem({ jobId: job.id, jobTitle: title, itemId: item.id }),
                        onRemove: () => void remove(`/api/job-items/${item.id}`, name),
                        // Dragged into the order the client should read it in.
                        drag: {
                          group: `job:${job.id}`,
                          onMove: (fromId, toId) =>
                            void moveJobItem(
                              job.id,
                              fromId.replace("jobitem:", ""),
                              toId.replace("jobitem:", ""),
                            ),
                        },
                      };
                    }),
                    {
                      id: `add:jobitem:${job.id}`,
                      label: "Add new",
                      detail: "Work done",
                      variant: "add",
                      onActivate: () => setJobItem({ jobId: job.id, jobTitle: title }),
                    },
                    contactRow(
                      `job:${job.id}`,
                      `/api/jobs/${job.id}`,
                      "works report",
                      job.contact,
                      site.contacts,
                      setContact,
                    ),
                  ],
                };
              }),
              {
                id: `add:job:${site.id}`,
                label: "Add new",
                detail: "Report",
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
    [clients, remove, startJob, setJobDate, setJobItem, setContact, moveJobItem],
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
    async (siteId: string, reportId?: string) => {
      const response = await fetch("/api/rcd-tests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, reportId }),
      });
      if (!response.ok) {
        setError("The test could not be started.");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const startRcdReport = useCallback(
    async (siteId: string) => {
      const response = await fetch("/api/rcd-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (!response.ok) {
        setError("The report could not be started.");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const setRcdReportDate = useCallback(
    async (id: string, date: string) => {
      const response = await fetch(`/api/rcd-reports/${id}`, {
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

  /**
   * RCD walks client → site → test. A test is a round of testing on one
   * board: the instrument's export goes in, the corrections are made, and a
   * report comes out.
   */
  const rcdNodes = useMemo<TreeNode[]>(
    () => [
      ...clients
        .map<TreeNode>((client) => {
          const sites = client.sites.map<TreeNode>((site) => ({
            id: `rcd:site:${site.id}`,
            label: site.name,
            detail:
              site.location?.trim() ||
              countLabel(site.rcdReports.length, "report", "reports"),
            children: [
              ...site.rcdReports.map<TreeNode>((report) => {
                const title = report.name?.trim() || isoLabel(report.date);
                // A report can be issued once at least one board has been
                // worked through to its results.
                const ready = report.tests.some((test) => test._count.results > 0);
                const boards = report.tests.length;
                return {
                  id: `rcdreport:${report.id}`,
                  label: title,
                  detail: [
                    countLabel(boards, "switchboard", "switchboards"),
                    report.instrument?.name,
                  ]
                    .filter(Boolean)
                    .join("  \u00b7  "),
                  editDate: {
                    value: isoDate(report.date),
                    onSave: (value: string) => void setRcdReportDate(report.id, value),
                  },
                  onDownload: ready
                    ? () => download(`/api/rcd-reports/${report.id}/report`)
                    : undefined,
                  onRemove: () => void remove(`/api/rcd-reports/${report.id}`, title),
                  children: [
                    ...report.tests.map<TreeNode>((run) => {
                      const done = run._count.results > 0;
                      const name = run.equipment?.name ?? "Switchboard";
                      return {
                        id: `rcdrun:${run.id}`,
                        label: name,
                        detail: done
                          ? // Readings, not devices: a three-phase device is
                            // tested on each phase and so keeps three of them.
                            countLabel(run._count.results, "reading", "readings")
                          : run.sourceFileId
                            ? "Corrections not finished"
                            : "No export loaded yet",
                        variant: "info",
                        onActivate: () => setRcd({ runId: run.id, siteName: site.name }),
                        onRemove: () => void remove(`/api/rcd-tests/${run.id}`, name),
                      };
                    }),
                    {
                      id: `add:rcdtest:${report.id}`,
                      label: "Add new",
                      detail: "Switchboard",
                      variant: "add",
                      onActivate: () => void startRcdTest(site.id, report.id),
                    },
                    contactRow(
                      `rcdreport:${report.id}`,
                      `/api/rcd-reports/${report.id}`,
                      "RCD report",
                      report.contact,
                      site.contacts,
                      setContact,
                    ),
                    {
                      id: `rcdgear:${report.id}`,
                      label: report.instrument?.name ?? "Instrument used",
                      detail: report.instrument
                        ? "Change the instrument"
                        : "Not recorded yet",
                      variant: "info",
                      onActivate: () =>
                        setRcdInstrument({
                          reportId: report.id,
                          instrumentId: report.instrument?.id ?? null,
                        }),
                    },
                  ],
                };
              }),
              {
                id: `add:rcd:${site.id}`,
                label: "Add new",
                detail: "Report",
                variant: "add",
                onActivate: () => void startRcdReport(site.id),
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
      // Last in the list rather than first: it is opened once when a standard
      // is revised, not on the way to a test.
      {
        id: "rcd:limits",
        label: "Limits",
        detail: "What a device is judged against",
        variant: "info",
        onActivate: () => setRcdLimits(true),
      },
    ],
    [clients, remove, startRcdTest, setRcdDate, setRcd, setRcdLimits, setContact, setRcdInstrument],
  );

  const setSafetyDate = useCallback(
    async (id: string, date: string) => {
      const response = await fetch(`/api/safety-docs/${id}`, {
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

  /**
   * Starting paperwork creates the empty record and opens it straight away.
   * Nothing is asked for up front: the questions belong in the dialog, where
   * the quote can answer most of them.
   */
  const startSafetyDoc = useCallback(
    async (site: SiteRecord, clientName: string) => {
      const response = await fetch("/api/safety-docs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId: site.id }),
      });
      if (!response.ok) {
        setError("That paperwork could not be started.");
        return;
      }
      const doc = (await response.json()) as { id: string };
      await refresh();
      setSafety({
        docId: doc.id,
        clientName,
        siteName: site.name,
        siteLocation: site.location,
        contacts: site.contacts.map((contact) => ({
          name: contact.name,
          phone: contact.phone ?? null,
        })),
      });
    },
    [refresh, setSafety],
  );

  /**
   * SWMS / JSA walks client → site → document set.
   *
   * One row is one job's paperwork: the quote it was read from, the statements
   * chosen, and the answers every document asks for. The documents themselves
   * are filled on the way out, so the row is always downloadable and always
   * carries whatever was answered last.
   */
  const swmsNodes = useMemo<TreeNode[]>(
    () =>
      clients
        .map<TreeNode>((client) => {
          const sites = client.sites.map<TreeNode>((site) => ({
            id: `swms:site:${site.id}`,
            label: site.name,
            detail:
              site.location?.trim() ||
              countLabel(site.safetyDocs.length, "document set", "document sets"),
            children: [
              ...site.safetyDocs.map<TreeNode>((doc) => {
                const title = doc.projectName?.trim() || isoLabel(doc.date);
                return {
                  id: `safety:${doc.id}`,
                  label: title,
                  detail: describeSafetyDoc(doc),
                  variant: "info",
                  editDate: {
                    value: isoDate(doc.date),
                    onSave: (value) => void setSafetyDate(doc.id, value),
                  },
                  onActivate: () =>
                    setSafety({
                      docId: doc.id,
                      clientName: client.name,
                      siteName: site.name,
                      siteLocation: site.location,
                      contacts: site.contacts.map((contact) => ({
                        name: contact.name,
                        phone: contact.phone ?? null,
                      })),
                    }),
                  onDownload: doc.codes.length
                    ? () => download(`/api/safety-docs/${doc.id}/download`)
                    : undefined,
                  onRemove: () => void remove(`/api/safety-docs/${doc.id}`, title),
                };
              }),
              {
                id: `add:safety:${site.id}`,
                label: "Add new",
                detail: "Document",
                variant: "add",
                onActivate: () => void startSafetyDoc(site, client.name),
              },
            ],
          }));

          return {
            id: `swms:client:${client.id}`,
            label: client.name,
            detail: countLabel(sites.length, "site", "sites"),
            children: sites,
          };
        })
        .filter((client) => (client.children?.length ?? 0) > 0),
    [clients, remove, startSafetyDoc, setSafetyDate, setSafety],
  );

  const setPowerDate = useCallback(
    async (id: string, date: string) => {
      const response = await fetch(`/api/power/${id}`, {
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

  /** Starting one needs no form; the recording carries its own dates. */
  const startPowerRun = useCallback(
    async (siteId: string, siteName: string) => {
      const response = await fetch("/api/power", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (!response.ok) {
        setError("That analysis could not be started.");
        return;
      }
      const run = (await response.json()) as { id: string };
      await refresh();
      setPower({ runId: run.id, siteName });
    },
    [refresh, setPower],
  );

  /**
   * Power Analysis walks client → site → analysis. One analysis is one
   * logger's recording: the file goes in, and a report comes out with a week
   * of it on each page.
   */
  const removeGear = useCallback(
    async (id: string, what: string) => {
      if (!window.confirm(`Remove ${what}? Reports already issued keep their copy.`)) return;
      await fetch(`/api/test-equipment/${id}`, { method: "DELETE" }).catch(() => {});
      await refreshGear();
    },
    [refreshGear],
  );

  const powerNodes = useMemo<TreeNode[]>(
    () =>
      clients
        .map<TreeNode>((client) => {
          const sites = client.sites.map<TreeNode>((site) => ({
            id: `power:site:${site.id}`,
            label: site.name,
            detail:
              site.location?.trim() ||
              countLabel(site.powerRuns.length, "analysis", "analyses"),
            children: [
              ...site.powerRuns.map<TreeNode>((run) => {
                const title = run.name?.trim() || isoLabel(run.date);
                return {
                  id: `power:${run.id}`,
                  label: title,
                  detail: describePowerRun(run),
                  variant: "info",
                  editDate: {
                    value: isoDate(run.date),
                    onSave: (value) => void setPowerDate(run.id, value),
                  },
                  onActivate: () => setPower({ runId: run.id, siteName: site.name }),
                  onDownload: run.summary
                    ? () => download(`/api/power/${run.id}/report`)
                    : undefined,
                  onRemove: () => void remove(`/api/power/${run.id}`, title),
                };
              }),
              {
                id: `add:power:${site.id}`,
                label: "Add new",
                detail: "Analysis",
                variant: "add",
                onActivate: () => void startPowerRun(site.id, site.name),
              },
            ],
          }));

          return {
            id: `power:client:${client.id}`,
            label: client.name,
            detail: countLabel(sites.length, "site", "sites"),
            children: sites,
          };
        })
        .filter((client) => (client.children?.length ?? 0) > 0),
    [clients, remove, startPowerRun, setPowerDate, setPower],
  );

  const equipmentNodes = useMemo<TreeNode[]>(
    () => [
      ...testGear.map<TreeNode>((item) => ({
        id: `gear:${item.id}`,
        label: item.name,
        // Model, serial, and when the calibration runs out — the last of which
        // is the thing worth noticing from across the room.
        detail: [
          item.modelNo,
          item.serialNo ? `S/N ${item.serialNo}` : null,
          item.expiresOn ? `Due ${isoDate(item.expiresOn).split("-").reverse().join("/")}` : null,
        ]
          .filter(Boolean)
          .join("  ·  ") || (item.certFile ? "Calibrated" : "No certificate"),
        variant: "info",
        onActivate: () =>
          setGearDialog({
            id: item.id,
            name: item.name,
            serialNo: item.serialNo,
            modelNo: item.modelNo,
            certFileId: item.certFile?.id ?? null,
            certName: item.certFile?.originalName ?? null,
            photoFileId: item.photoFile?.id ?? null,
            photoUrl: item.photoFile ? `/api/files/${item.photoFile.id}` : null,
            calibratedOn: item.calibratedOn ? isoDate(item.calibratedOn) : null,
            expiresOn: item.expiresOn ? isoDate(item.expiresOn) : null,
          }),
        onRemove: () => void removeGear(item.id, item.name),
      })),
      {
        id: "add:gear",
        label: "Add new",
        detail: "Equipment",
        variant: "add",
        onActivate: () => setGearDialog({ ...EMPTY_EQUIPMENT }),
      },
    ],
    [testGear, setGearDialog, removeGear],
  );

  return {
    nodes,
    thermalNodes,
    baNodes,
    equipmentNodes,
    gearDialog,
    closeGear: () => setGearDialog(null),
    savedGear: () => {
      setGearDialog(null);
      void refreshGear();
    },
    rcdNodes,
    swmsNodes,
    powerNodes,
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
    rcdInstrument,
    closeRcdInstrument: () => {
      setRcdInstrument(null);
      void refresh();
    },
    contact,
    /** Picked somebody: the tree redraws, the dialog stays open. */
    contactPicked: (contactId: string | null) => {
      setContact((current) => (current ? { ...current, contactId } : current));
      void refresh();
    },
    closeContact: () => {
      setContact(null);
      void refresh();
    },
    rcd,
    closeRcd: () => {
      setRcd(null);
      void refresh();
    },
    safety,
    closeSafety: () => {
      setSafety(null);
      void refresh();
    },
    rcdLimits,
    closeRcdLimits: () => setRcdLimits(false),
    power,
    closePower: () => {
      setPower(null);
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
  download(`/api/inspections/${inspectionId}/report`);
}

/**
 * Fetches a report.
 *
 * The routes answer with an attachment, so a link click is what is wanted, not
 * a new window: `window.open` on an attachment opens a tab that closes itself
 * again the instant the download starts, which on a phone or behind a popup
 * blocker means nothing visibly happens at all.
 */
function download(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  // Empty, so the name comes off the response rather than the URL.
  link.download = "";
  document.body.append(link);
  link.click();
  link.remove();
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

/** "SWMS014 + JSA001", or what is still missing before it can be issued. */
function describeSafetyDoc(doc: {
  codes: string[];
  projectName: string | null;
  sourceFileId: string | null;
}): string {
  if (doc.codes.length === 0) {
    return doc.sourceFileId ? "Quote read — nothing chosen yet" : "Not started";
  }
  const listed = doc.codes.slice(0, 3).join(" + ");
  const rest = doc.codes.length - 3;
  const documents = rest > 0 ? `${listed} +${rest}` : listed;
  return doc.projectName?.trim() ? documents : `${documents}  ·  Not named yet`;
}

/** "8 days · peak 72 A on L3", or what is still missing. */
function describePowerRun(run: PowerRunRecord): string {
  if (!run.summary) {
    return run.sourceFileId ? "Recording not readable" : "No recording loaded yet";
  }
  const days = Math.max(1, Math.round((run.summary.to - run.summary.from) / 86_400_000));
  const span = `${days} ${days === 1 ? "day" : "days"}`;
  const highest = run.summary.highest;
  const peak = highest
    ? `peak ${highest.amps} A on ${highest.channel.toUpperCase()}`
    : "no readings";
  return run.location?.trim() ? `${run.location.trim()}  ·  ${span}  ·  ${peak}` : `${span}  ·  ${peak}`;
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

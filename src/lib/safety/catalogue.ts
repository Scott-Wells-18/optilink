/**
 * The safe work paperwork, as a library.
 *
 * Every SWMS and JSA OptiLink has written, listed once here with what it
 * covers. The documents themselves live in the app's file store rather than in
 * this repository — they carry signatures, and a repository is the wrong place
 * for those.
 *
 * `tags` are what a job description is matched against when a quote is read.
 * They are deliberately the words a sparky would actually type into a quote,
 * not the words in the document's title.
 */

export type DocKind = "SWMS" | "JSA" | "WHS";

export type Template = {
  /** "SWMS014" — the code printed on the document itself. */
  code: string;
  kind: DocKind;
  title: string;
  /** The file as it was uploaded, so a re-import can find it again. */
  file: string;
  /** Word documents are filled and handed back as Word; PDFs stay PDFs. */
  format: "pdf" | "docx";
  /** Words in a job description that suggest this document. */
  tags: string[];
  /** The JSA that goes with a SWMS, where one has been written. */
  pairs?: string;
};

export const TEMPLATES: Template[] = [
  {
    code: "SWMS001",
    kind: "SWMS",
    title: "Electrical Equipment & Cabling",
    file: "OEC-SWMS001.Electrical.Equipment.Cabling.SWMS.pdf",
    format: "pdf",
    pairs: "JSA001",
    tags: ["cabling", "cable", "equipment", "general electrical", "install", "wiring"],
  },
  {
    code: "SWMS001A",
    kind: "SWMS",
    title: "Electrical & Communication Rough In and Fit Out",
    file: "OEC-SWMS001A.Electrical.Communication.Rough.In.and.Fit.Out.SWMS.pdf",
    format: "pdf",
    pairs: "JSA001A",
    tags: ["rough in", "roughin", "fit out", "fitout", "new build", "construction"],
  },
  {
    code: "SWMS002",
    kind: "SWMS",
    title: "Emergency Electrical Works",
    file: "OEC-SWMS002.Emergency.Electrical.Works.SWMS.pdf",
    format: "pdf",
    pairs: "JSA002",
    tags: ["emergency", "urgent", "after hours", "breakdown", "callout", "call out"],
  },
  {
    code: "SWMS003",
    kind: "SWMS",
    title: "Communications & Data Cabling",
    file: "OEC-SWMS003.Communications.Data.Cabling.SWMS.pdf",
    format: "pdf",
    pairs: "JSA003",
    tags: ["data", "comms", "communication", "cat6", "cat5", "fibre", "network", "patch"],
  },
  {
    code: "SWMS004",
    kind: "SWMS",
    title: "Switchboard Installation & Upgrade",
    file: "OEC-SWMS004.Switchboard.Installation.Upgrade.SWMS.pdf",
    format: "pdf",
    tags: ["switchboard install", "new switchboard", "board upgrade", "upgrade", "db install"],
  },
  {
    code: "SWMS004A",
    kind: "SWMS",
    title: "Switchboard Removal, Installation & Modification",
    file: "OEC-SWMS004A.Switchboard.Removal.Installation.and.Modification.SWMS.pdf",
    format: "pdf",
    tags: ["switchboard removal", "modification", "modify board", "replace board", "relocate"],
  },
  {
    code: "SWMS004B",
    kind: "SWMS",
    title: "Main Switchboard Isolation, Inspection & Maintenance",
    file: "OEC-SWMS004B.Main.Switchboard.Isolation.Inspection.Maintenance.SWMS.pdf",
    format: "pdf",
    tags: ["msb", "main switchboard", "isolation", "isolate", "maintenance", "inspection"],
  },
  {
    code: "SWMS005",
    kind: "SWMS",
    title: "Testing, Tagging & Commissioning",
    file: "OEC-SWMS005.Testing.Tagging.Commissioning.SWMS.pdf",
    format: "pdf",
    tags: ["test and tag", "test & tag", "tagging", "commissioning", "commission"],
  },
  {
    code: "SWMS006",
    kind: "SWMS",
    title: "Excavation & Pit Installation",
    file: "OEC-SWMS006.Excavation.Pit.Installation.SWMS.pdf",
    format: "pdf",
    tags: ["excavation", "excavate", "dig", "trench", "pit", "underground", "bore"],
  },
  {
    code: "SWMS006A",
    kind: "SWMS",
    title: "Install Electrical Cabling & Conduit in Pit",
    file: "OEC-SWMS006A.Install.Electrical.Cabling.and.Conduit.in.Pit.SWMS.pdf",
    format: "pdf",
    tags: ["conduit", "pit", "underground cable", "duct", "hauling"],
  },
  {
    code: "SWMS007",
    kind: "SWMS",
    title: "Work at Heights",
    file: "OEC-SWMS007.Work.at.Heights.SWMS.pdf",
    format: "pdf",
    tags: ["heights", "height", "ladder", "ewp", "scissor lift", "scaffold", "roof", "elevated"],
  },
  {
    code: "SWMS008",
    kind: "SWMS",
    title: "Temporary Electrical Works",
    file: "OEC-SWMS008.Temporary.Electrical.Works.SWMS.pdf",
    format: "pdf",
    tags: ["temporary", "temp power", "builders supply", "site supply", "festoon"],
  },
  {
    code: "SWMS009",
    kind: "SWMS",
    title: "Asbestos-Related Electrical Work",
    file: "OEC-SWMS009.Asbestos-Related.Electrical.Work.SWMS.pdf",
    format: "pdf",
    tags: ["asbestos", "acm", "zelemite", "ausbestos", "hazardous material"],
  },
  {
    code: "SWMS010",
    kind: "SWMS",
    title: "Service Disconnection — Make-Safe",
    file: "OEC-SWMS010.Service.Disconnection.-.Make-Safe.SWMS.pdf",
    format: "pdf",
    tags: ["disconnection", "disconnect", "make safe", "make-safe", "demolition", "service"],
  },
  {
    code: "SWMS011",
    kind: "SWMS",
    title: "Ventilation Duct Removal Work",
    file: "OEC-SWMS011.Ventlation.Duct.Removal.Work.SWMS.pdf",
    format: "pdf",
    tags: ["ventilation", "duct", "ductwork", "exhaust", "extraction"],
  },
  {
    code: "SWMS012",
    kind: "SWMS",
    title: "Hot Works",
    file: "OEC-SWMS012.Hot.Works.SWMS.pdf",
    format: "pdf",
    tags: ["hot work", "hot works", "welding", "grinding", "cutting", "angle grinder"],
  },
  {
    code: "SWMS013",
    kind: "SWMS",
    title: "Thermal Imaging of Switchboards",
    file: "OEC-SWMS013.Thermal.Imaging.of.Switchboards.SWMS.pdf",
    format: "pdf",
    tags: ["thermal", "thermographic", "thermography", "infrared", "imaging", "survey"],
  },
  {
    code: "SWMS014",
    kind: "SWMS",
    title: "RCD Testing",
    file: "OEC-SWMS014.RCD.Testing.SWMS.pdf",
    format: "pdf",
    tags: ["rcd", "safety switch", "rcd testing", "trip test", "residual current"],
  },

  {
    code: "JSA001",
    kind: "JSA",
    title: "Electrical Equipment & Cabling — Risk Assessment",
    file: "OEC-JSA001.Electrical.Equipment.Cabling.JSA.Risk.Assessment.docx",
    format: "docx",
    tags: ["cabling", "cable", "equipment", "general electrical", "install", "wiring"],
  },
  {
    code: "JSA001A",
    kind: "JSA",
    title: "Electrical & Communication Rough In and Fit Out",
    file: "OEC-JSA001A.Electrical.Communication.Rough.In.and.Fit.Out.JSA.docx",
    format: "docx",
    tags: ["rough in", "roughin", "fit out", "fitout", "new build", "construction"],
  },
  {
    code: "JSA002",
    kind: "JSA",
    title: "Emergency Electrical Works — Risk Assessment",
    file: "OEC-JSA002.Emergency.Electrical.Works.JSA.Risk.Assessment.docx",
    format: "docx",
    tags: ["emergency", "urgent", "after hours", "breakdown", "callout", "call out"],
  },
  {
    code: "JSA003",
    kind: "JSA",
    title: "Communications & Data Cabling — Risk Assessment",
    file: "OEC-JSA003.Communications.Data.Cabling.JSA.Risk.Assessment.docx",
    format: "docx",
    tags: ["data", "comms", "communication", "cat6", "cat5", "fibre", "network", "patch"],
  },

  {
    code: "WHS002",
    kind: "WHS",
    title: "Energised Electrical Testing — Justification & PCBU Authorisation",
    file: "OEC-WHS002.Energised.Electrical.Testing.Justification.and.PCBU.Authorisation.docx",
    format: "docx",
    tags: ["energised", "energized", "live work", "live testing", "no isolation"],
  },
];

export const BY_CODE = new Map(TEMPLATES.map((template) => [template.code, template]));

export function templatesOfKind(kind: DocKind): Template[] {
  return TEMPLATES.filter((template) => template.kind === kind);
}

/**
 * Which documents a job description points at.
 *
 * A quote's job description is matched against each template's tags and the
 * ones that hit come back best-first, with the words that matched — so the
 * operator sees why something was suggested and can throw it out. Nothing is
 * ever chosen silently: a wrong SWMS picked without anyone looking is worse
 * than picking from a list.
 */
export type Suggestion = { template: Template; score: number; matched: string[] };

export function suggest(description: string, kind?: DocKind): Suggestion[] {
  const text = ` ${description.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const out: Suggestion[] = [];

  for (const template of TEMPLATES) {
    if (kind && template.kind !== kind) continue;
    if (template.kind === "WHS") continue;
    const matched = template.tags.filter((tag) => text.includes(` ${tag} `));
    if (matched.length === 0) continue;
    // A longer tag is a stronger signal: "safety switch" says more than "rcd".
    const score = matched.reduce((total, tag) => total + 1 + tag.split(" ").length, 0);
    out.push({ template, score, matched });
  }

  return out.sort((a, b) => b.score - a.score || a.template.code.localeCompare(b.template.code));
}

/** Who signs. Both names are already printed on every SWMS. */
export const SIGNATORIES = [
  { key: "scott", name: "Scott Wells", position: "Director" },
  { key: "kye", name: "Kye Wells", position: "Apprentice Electrician" },
] as const;

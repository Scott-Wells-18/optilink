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
    pairs: "JSA004",
    tags: ["switchboard install", "new switchboard", "board upgrade", "upgrade", "db install"],
  },
  {
    code: "SWMS004A",
    kind: "SWMS",
    title: "Switchboard Removal, Installation & Modification",
    file: "OEC-SWMS004A.Switchboard.Removal.Installation.and.Modification.SWMS.pdf",
    format: "pdf",
    pairs: "JSA004A",
    tags: ["switchboard removal", "modification", "modify board", "replace board", "relocate"],
  },
  {
    code: "SWMS004B",
    kind: "SWMS",
    title: "Main Switchboard Isolation, Inspection & Maintenance",
    file: "OEC-SWMS004B.Main.Switchboard.Isolation.Inspection.Maintenance.SWMS.pdf",
    format: "pdf",
    pairs: "JSA004B",
    tags: ["msb", "main switchboard", "isolation", "isolate", "maintenance", "inspection"],
  },
  {
    code: "SWMS005",
    kind: "SWMS",
    title: "Testing, Tagging & Commissioning",
    file: "OEC-SWMS005.Testing.Tagging.Commissioning.SWMS.pdf",
    format: "pdf",
    pairs: "JSA005",
    tags: ["test and tag", "test & tag", "tagging", "commissioning", "commission"],
  },
  {
    code: "SWMS006",
    kind: "SWMS",
    title: "Excavation & Pit Installation",
    file: "OEC-SWMS006.Excavation.Pit.Installation.SWMS.pdf",
    format: "pdf",
    pairs: "JSA006",
    tags: ["excavation", "excavate", "dig", "trench", "pit", "underground", "bore"],
  },
  {
    code: "SWMS006A",
    kind: "SWMS",
    title: "Install Electrical Cabling & Conduit in Pit",
    file: "OEC-SWMS006A.Install.Electrical.Cabling.and.Conduit.in.Pit.SWMS.pdf",
    format: "pdf",
    pairs: "JSA006A",
    tags: ["conduit", "pit", "underground cable", "duct", "hauling"],
  },
  {
    code: "SWMS007",
    kind: "SWMS",
    title: "Work at Heights",
    file: "OEC-SWMS007.Work.at.Heights.SWMS.pdf",
    format: "pdf",
    pairs: "JSA007",
    tags: ["heights", "height", "ladder", "ewp", "scissor lift", "scaffold", "roof", "elevated"],
  },
  {
    code: "SWMS008",
    kind: "SWMS",
    title: "Temporary Electrical Works",
    file: "OEC-SWMS008.Temporary.Electrical.Works.SWMS.pdf",
    format: "pdf",
    pairs: "JSA008",
    tags: ["temporary", "temp power", "builders supply", "site supply", "festoon"],
  },
  {
    code: "SWMS009",
    kind: "SWMS",
    title: "Asbestos-Related Electrical Work",
    file: "OEC-SWMS009.Asbestos-Related.Electrical.Work.SWMS.pdf",
    format: "pdf",
    pairs: "JSA009",
    tags: ["asbestos", "acm", "zelemite", "ausbestos", "hazardous material"],
  },
  {
    code: "SWMS010",
    kind: "SWMS",
    title: "Service Disconnection — Make-Safe",
    file: "OEC-SWMS010.Service.Disconnection.-.Make-Safe.SWMS.pdf",
    format: "pdf",
    pairs: "JSA010",
    tags: ["disconnection", "disconnect", "make safe", "make-safe", "demolition", "service"],
  },
  {
    code: "SWMS011",
    kind: "SWMS",
    title: "Ventilation Duct Removal Work",
    file: "OEC-SWMS011.Ventlation.Duct.Removal.Work.SWMS.pdf",
    format: "pdf",
    pairs: "JSA011",
    tags: ["ventilation", "duct", "ductwork", "exhaust", "extraction"],
  },
  {
    code: "SWMS012",
    kind: "SWMS",
    title: "Hot Works",
    file: "OEC-SWMS012.Hot.Works.SWMS.pdf",
    format: "pdf",
    pairs: "JSA012",
    tags: ["hot work", "hot works", "welding", "grinding", "cutting", "angle grinder"],
  },
  {
    code: "SWMS013",
    kind: "SWMS",
    title: "Thermal Imaging of Switchboards",
    file: "OEC-SWMS013.Thermal.Imaging.of.Switchboards.SWMS.pdf",
    format: "pdf",
    pairs: "JSA013",
    tags: ["thermal", "thermographic", "thermography", "infrared", "imaging", "survey"],
  },
  {
    code: "SWMS014",
    kind: "SWMS",
    title: "RCD Testing",
    file: "OEC-SWMS014.RCD.Testing.SWMS.pdf",
    format: "pdf",
    pairs: "JSA014",
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
    code: "JSA004",
    kind: "JSA",
    title: "Switchboard Installation & Upgrade — Risk Assessment",
    file: "OEC-JSA004.Switchboard.Installation.and.Upgrade.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["switchboard install", "new switchboard", "board upgrade", "upgrade", "db install"],
  },
  {
    code: "JSA004A",
    kind: "JSA",
    title: "Switchboard Removal, Installation & Modification — Risk Assessment",
    file: "OEC-JSA004A.Switchboard.Removal.Installation.and.Modification.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["switchboard removal", "modification", "modify board", "replace board", "relocate"],
  },
  {
    code: "JSA004B",
    kind: "JSA",
    title: "Main Switchboard Isolation, Inspection & Maintenance — Risk Assessment",
    file: "OEC-JSA004B.Main.Switchboard.Isolation.Inspection.and.Maintenance.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["msb", "main switchboard", "isolation", "isolate", "maintenance", "inspection"],
  },
  {
    code: "JSA005",
    kind: "JSA",
    title: "Testing, Tagging & Commissioning — Risk Assessment",
    file: "OEC-JSA005.Testing.Tagging.and.Commissioning.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["test and tag", "test & tag", "tagging", "commissioning", "commission"],
  },
  {
    code: "JSA006",
    kind: "JSA",
    title: "Excavation & Pit Installation — Risk Assessment",
    file: "OEC-JSA006.Excavation.and.Pit.Installation.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["excavation", "excavate", "dig", "trench", "pit", "underground", "bore"],
  },
  {
    code: "JSA006A",
    kind: "JSA",
    title: "Install Electrical Cabling & Conduit in Pit — Risk Assessment",
    file: "OEC-JSA006A.Install.Electrical.Cabling.and.Conduit.in.Pit.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["conduit", "pit", "underground cable", "duct", "hauling"],
  },
  {
    code: "JSA007",
    kind: "JSA",
    title: "Work at Heights — Risk Assessment",
    file: "OEC-JSA007.Work.at.Heights.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["heights", "height", "ladder", "ewp", "scissor lift", "scaffold", "roof", "elevated"],
  },
  {
    code: "JSA008",
    kind: "JSA",
    title: "Temporary Electrical Works — Risk Assessment",
    file: "OEC-JSA008.Temporary.Electrical.Works.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["temporary", "temp power", "builders supply", "site supply", "festoon"],
  },
  {
    code: "JSA009",
    kind: "JSA",
    title: "Asbestos-Related Electrical Work — Risk Assessment",
    file: "OEC-JSA009.Asbestos.Related.Electrical.Work.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["asbestos", "acm", "zelemite", "hazardous material"],
  },
  {
    code: "JSA010",
    kind: "JSA",
    title: "Service Disconnection & Make-Safe — Risk Assessment",
    file: "OEC-JSA010.Service.Disconnection.and.Make.Safe.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["disconnection", "disconnect", "make safe", "make-safe", "demolition", "service"],
  },
  {
    code: "JSA011",
    kind: "JSA",
    title: "Ventilation Duct Removal Work — Risk Assessment",
    file: "OEC-JSA011.Ventilation.Duct.Removal.Work.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["ventilation", "duct", "ductwork", "exhaust", "extraction"],
  },
  {
    code: "JSA012",
    kind: "JSA",
    title: "Hot Works — Risk Assessment",
    file: "OEC-JSA012.Hot.Works.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["hot work", "hot works", "welding", "grinding", "cutting", "angle grinder"],
  },
  {
    code: "JSA013",
    kind: "JSA",
    title: "Thermal Imaging of Switchboards — Risk Assessment",
    file: "OEC-JSA013.Thermal.Imaging.of.Switchboards.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["thermal", "thermographic", "thermography", "infrared", "imaging", "survey"],
  },
  {
    code: "JSA014",
    kind: "JSA",
    title: "RCD Testing — Risk Assessment",
    file: "OEC-JSA014.RCD.Testing.JSA.Risk.Assessment.pdf",
    format: "pdf",
    tags: ["rcd", "safety switch", "rcd testing", "trip test", "residual current"],
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

/**
 * Who signs, in the order the forms list them.
 *
 * Both signatures are already printed on page one of every released SWMS.
 * That is a property of the source documents, not something this app does,
 * and it is listed in the discrepancies below — nothing here applies a
 * signature to anything until the person it belongs to has said so.
 */
export const SIGNATORIES = [
  { key: "kye", name: "Kye Wells", position: "Apprentice Electrician" },
  { key: "scott", name: "Scott Wells", position: "Director Electrician" },
] as const;

export type Signatory = (typeof SIGNATORIES)[number];

/**
 * Where a released document disagrees with itself.
 *
 * Found by reading the released files rather than by assuming: the printed
 * identifier, the filename and the file's own metadata were compared for all
 * thirty-seven documents. None of these is corrected automatically — a
 * controlled document number is not ours to rewrite — so they are listed here,
 * shown in the app beside the library, and left for the author to fix at the
 * source.
 */
export type Discrepancy = {
  /** The document as the catalogue knows it. */
  code: string;
  /** Where the disagreement is. */
  where: "filename" | "printed title" | "page footer" | "file metadata";
  says: string;
  /** What the document's own printed identifier and content say it is. */
  shouldRead: string;
};

export const DISCREPANCIES: Discrepancy[] = [
  {
    code: "SWMS013",
    where: "printed title",
    says:
      "The signatories table prints both signatures and both positions but leaves the two Full Name cells empty.",
    shouldRead:
      "Scott Wells and Kye Wells, as every other statement in the library prints them. The app fills those two cells so the signatures are attributable; the released file leaves a signature with no name against it.",
  },
  {
    code: "every SWMS",
    where: "printed title",
    says:
      "Page one of all eighteen released SWMS carries Scott Wells' and Kye Wells' signatures already printed in the consultation block.",
    shouldRead:
      "A blank signature block. As released, every statement looks signed before anyone has read it. The app cannot undo that without redrawing the document, so it fills the dates beside those signatures only for a person who has confirmed at the signing step, and leaves them empty otherwise.",
  },
  {
    code: "SWMS001A",
    where: "printed title",
    says: "ELECTRICAL EQUIPMENT & CABLING SAFE WORK METHOD STATEMENT (SWMS)",
    shouldRead:
      "Electrical & Communication Rough In and Fit Out — the title block still carries SWMS001's title, though the identifier, the filename and the method itself are 001A's.",
  },
  {
    code: "SWMS004B",
    where: "printed title",
    says: "MAIN SWITCHOARD - ISOLATION, INSPECTION & MAINTENANCE",
    shouldRead: "MAIN SWITCHBOARD — the printed title is missing the B in Switchboard.",
  },
  {
    code: "SWMS011",
    where: "filename",
    says: "OEC-SWMS011.Ventlation.Duct.Removal.Work.SWMS.pdf",
    shouldRead:
      "Ventilation — the filename is missing the i. The printed title inside the document is spelled correctly.",
  },
  {
    code: "SWMS001A",
    where: "page footer",
    says: "OEC-SWMS001 ELECTRICAL EQUIPMENT & CABLING SAFE WORK METHOD STATEMENT (SWMS)",
    shouldRead:
      "OEC-SWMS001A, Electrical & Communication Rough In and Fit Out — the footer carries both the wrong number and SWMS001's title.",
  },
  {
    code: "SWMS004A",
    where: "page footer",
    says: "OEC-SWMS002 SWITCHBOARD REMOVAL, INSTALLATION & MODIFICATION SAFE WORK METHOD STATEMENT (SWMS)",
    shouldRead:
      "OEC-SWMS004A — the title is right, the number is SWMS002's.",
  },
  {
    code: "SWMS004B",
    where: "page footer",
    says: "OEC-SWMS001 MAIN SWITCHBOARD - ISOLATION, INSPECTION & MAINTENANCE SWMS",
    shouldRead:
      "OEC-SWMS004B — the number is SWMS001's. The footer spells Switchboard correctly, which the page heading does not.",
  },
  {
    code: "SWMS006A",
    where: "page footer",
    says: "OEC-SWMS007 INSTALL ELECTRICAL CABLING AND CONDUIT IN PIT SAFE WORK METHOD STATEMENT (SWMS)",
    shouldRead:
      "OEC-SWMS006A — the title is right, the number is SWMS007's.",
  },
  {
    code: "SWMS008",
    where: "page footer",
    says: "OEC-SWMS005 TEMPORARY ELECTRICAL WORKS SAFE WORK METHOD STATEMENT (SWMS)",
    shouldRead:
      "OEC-SWMS008 — the title is right, the number is SWMS005's.",
  },
  {
    code: "SWMS011",
    where: "page footer",
    says: "OEC-SWMS001 ELECTRICAL EQUIPMENT & CABLING SAFE WORK METHOD STATEMENT (SWMS)",
    shouldRead:
      "OEC-SWMS011, Ventilation Duct Removal — the footer carries both the wrong number and SWMS001's title.",
  },
  {
    code: "SWMS012",
    where: "page footer",
    says: "OEC-SWMS001 ELECTRICAL EQUIPMENT & CABLING SAFE WORK METHOD STATEMENT (SWMS)",
    shouldRead:
      "OEC-SWMS012, Hot Works — the footer carries both the wrong number and SWMS001's title.",
  },
  {
    code: "SWMS013",
    where: "page footer",
    says: "OEC-SWMS001 THERMAL IMAGING INSPECTION OF SWITCHBOARDS SWMS",
    shouldRead:
      "OEC-SWMS013 — the title is right, the number is SWMS001's.",
  },
  {
    code: "SWMS014",
    where: "page footer",
    says: "OEC-SWMS001 RCD TESTING SAFE WORK METHOD STATEMENT (SWMS)",
    shouldRead:
      "OEC-SWMS014 — the title is right, the number is SWMS001's.",
  },
  ...[
    "JSA004", "JSA004A", "JSA004B", "JSA005", "JSA006", "JSA006A", "JSA007",
    "JSA008", "JSA009", "JSA010", "JSA011", "JSA012", "JSA013", "JSA014",
  ].map<Discrepancy>((code) => ({
    code,
    where: "file metadata",
    says: "OEC-JSA003 Communications and Data Cabling JSA Risk Assessment",
    shouldRead:
      "Every one of the fourteen JSAs exported as PDF carries JSA003's title in the PDF's own metadata — they were all exported from that file. What is printed on the page is right; only the file's properties are wrong.",
  })),
];

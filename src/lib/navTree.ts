/**
 * The navigation tree behind the hub.
 *
 * Every section is filled from the database at runtime (see useClientsTree):
 * the same clients → sites walk, read a different way by each one.
 */

export type TreeNode = {
  id: string;
  label: string;
  detail?: string;
  children?: TreeNode[];
  /**
   * "add" is the grey tile at the end of a list; "info" is a row whose detail
   * is only shown when it is opened. Both run onActivate instead of expanding.
   */
  variant?: "add" | "info";
  onActivate?: () => void;
  /** Present on rows that can be deleted. Shows a remove control on hover. */
  onRemove?: () => void;
  /**
   * A label that is a date. Double-clicking the row swaps it for a date
   * picker, and picking a day saves it.
   */
  editDate?: { value: string; onSave: (value: string) => void };
  /** Shows a pencil beside the remove control. */
  onEdit?: () => void;
  /** Shows a download button beside the chevron. */
  onDownload?: () => void;
  /**
   * Draggable into a different place among its siblings.
   *
   * Rows carrying the same `group` can be dropped on one another; `onMove` is
   * handed the row that was picked up and the row it was dropped on, and it is
   * for the owner of the list to work out what that means. A row without this
   * cannot be dragged and cannot be dropped on.
   */
  drag?: { group: string; onMove: (fromId: string, toId: string) => void };
};

/**
 * The sections, in the order they are worked.
 *
 * Three groups, and the order is the order of a working day rather than the
 * order they were built in: who we are, who we work for and what we work with;
 * then our own paperwork, which is nobody else's business and is kept behind
 * one card; then the reports that go to a client, which is most of what the
 * app is for.
 *
 * Labels are short because the cards are all the same size: a label that wraps
 * makes one card taller than the rest and the column stops being a column.
 * Whatever a section is actually for goes in the detail line underneath.
 */
export const SECTIONS: TreeNode[] = [
  /* --- us, and who we work for ------------------------------------------- */
  {
    id: "profiles",
    label: "Profiles",
    detail: "Who signs the paperwork",
    children: [],
  },
  {
    id: "clients",
    label: "Clients",
    detail: "Sites & contacts",
    children: [],
  },
  {
    id: "equipment",
    label: "Equipment",
    detail: "Our test gear & calibration",
    children: [],
  },

  /* --- our own paperwork -------------------------------------------------- */
  {
    id: "optilink",
    label: "Optilink",
    detail: "Our own paperwork",
    children: [
      {
        id: "swms",
        label: "SWMS / JSA",
        detail: "Safe work paperwork",
        children: [],
      },
      {
        id: "tagging",
        label: "Equipment Tagging",
        detail: "Our own test & tag register",
        children: [],
      },
    ],
  },

  /* --- what goes to a client ---------------------------------------------- */
  {
    id: "thermal",
    label: "Thermal",
    detail: "Infrared surveys",
    children: [],
  },
  {
    id: "rcd",
    label: "RCD Report",
    detail: "RCD & RCBO testing",
    children: [],
  },
  {
    id: "power",
    label: "Power Analysis",
    detail: "Long current recordings",
    children: [],
  },
  {
    id: "amps",
    label: "Amp Readings",
    detail: "Short current recordings",
    children: [],
  },
  {
    id: "ba",
    label: "Works Completed",
    detail: "Completed works & rectifications",
    children: [],
  },
  {
    id: "install",
    label: "Installation",
    detail: "Insulation, RCD & polarity tests",
    children: [],
  },
  {
    id: "testtag",
    label: "Test & Tag",
    detail: "A client's tagged equipment",
    children: [],
  },
  {
    id: "gates",
    label: "Gate Service",
    detail: "Boom & sliding gate servicing",
    children: [],
  },
];

/** Every section id, nested ones included, for filling children by id. */
export function sectionIds(nodes: TreeNode[] = SECTIONS): string[] {
  return nodes.flatMap((node) => [node.id, ...sectionIds(node.children ?? [])]);
}

/**
 * The sections with each one's children filled in.
 *
 * Walks the whole tree rather than the top row, because the sections inside
 * the Optilink card are sections too — they are simply kept behind it.
 */
export function withChildren(
  fill: Record<string, TreeNode[]>,
  nodes: TreeNode[] = SECTIONS,
): TreeNode[] {
  return nodes.map((node) => {
    const own = fill[node.id];
    if (own) return { ...node, children: own };
    const kids = node.children ?? [];
    return kids.length > 0 ? { ...node, children: withChildren(fill, kids) } : node;
  });
}

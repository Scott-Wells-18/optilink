/**
 * The navigation tree behind the hub.
 *
 * Clients is filled from the database at runtime (see useClientsTree). The
 * other sections are still placeholders — three options, each with two, each
 * with one — waiting on the real steps.
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
};

export const SECTIONS: TreeNode[] = [
  {
    id: "thermal",
    label: "Thermal",
    detail: "Infrared surveys",
    children: [],
  },
  {
    id: "rcd",
    label: "RCD",
    detail: "Safety switch testing",
    children: [],
  },
  {
    id: "ba",
    label: "B&A",
    detail: "Before & after",
    children: [],
  },
  {
    id: "swms",
    label: "SWMS",
    detail: "Safe work method statements",
    children: [],
  },
  {
    id: "clients",
    label: "Clients",
    detail: "Sites & contacts",
    children: [],
  },
];

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
   * Present on the grey "add new" tiles. Runs instead of expanding the node.
   */
  onActivate?: () => void;
  /** Present on rows that can be deleted. Shows a remove control on hover. */
  onRemove?: () => void;
};

function placeholderBranches(prefix: string): TreeNode[] {
  return [1, 2, 3].map((first) => ({
    id: `${prefix}.${first}`,
    label: `Test ${first}`,
    children: [1, 2].map((second) => ({
      id: `${prefix}.${first}.${second}`,
      label: `Test ${second}`,
      children: [{ id: `${prefix}.${first}.${second}.1`, label: "Test 1" }],
    })),
  }));
}

export const SECTIONS: TreeNode[] = [
  {
    id: "thermal",
    label: "Thermal",
    detail: "Infrared surveys",
    children: placeholderBranches("thermal"),
  },
  {
    id: "rcd",
    label: "RCD",
    detail: "Safety switch testing",
    children: placeholderBranches("rcd"),
  },
  {
    id: "ba",
    label: "B&A",
    detail: "Before & after",
    children: placeholderBranches("ba"),
  },
  {
    id: "clients",
    label: "Clients",
    detail: "Sites & contacts",
    children: [],
  },
];

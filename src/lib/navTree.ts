/**
 * The navigation tree behind the hub.
 *
 * The branches below each section are placeholders — three options, each with
 * two, each of those with one — so the shape and the animation can be judged
 * before the real steps are written.
 */

export type TreeNode = {
  id: string;
  label: string;
  detail?: string;
  children?: TreeNode[];
};

function placeholderBranches(prefix: string): TreeNode[] {
  return [1, 2, 3].map((first) => ({
    id: `${prefix}.${first}`,
    label: `Test ${first}`,
    children: [1, 2].map((second) => ({
      id: `${prefix}.${first}.${second}`,
      label: `Test ${second}`,
      children: [
        {
          id: `${prefix}.${first}.${second}.1`,
          label: "Test 1",
        },
      ],
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
    children: placeholderBranches("clients"),
  },
];

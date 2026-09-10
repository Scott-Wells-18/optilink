"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { TreeNode } from "@/lib/navTree";
import { easeIntoView } from "@/lib/useSpringScroll";

/**
 * A sideways tree. Pressing a node opens its branches to the right; pressing it
 * again closes them, which is how you step back. One branch is open per level,
 * and everything off that path fades back.
 *
 * Opening a branch changes the height of the row it sits in, which would
 * otherwise shunt its neighbours around with a hard cut. Every position is
 * measured before the change and again after, and the difference is played back
 * as a transform — so anything that has to move, glides.
 */

const REVEAL_MS = 560;
/** The tree slides aside first; branches start drawing part-way through. */
const SLIDE_LEAD_MS = 220;
/** Width of the gutter the connecting curves are drawn in. */
const LINK_WIDTH = 92;
/**
 * Curves run a little way underneath the cards at both ends. Cards paint over
 * the top, so a card nudging sideways on hover can never leave a gap.
 */
const LINK_TUCK = 16;
/**
 * How far above the parent's centre the first child sits. Fixed at every level
 * so the first curve always has the same gentle rise, whatever size the cards.
 */
const FIRST_CHILD_LIFT = 13;
/** Clear space left below the lowest card once scrolled to the bottom. */
const BOTTOM_ROOM = 76;
const FLIP_MS = 700;
const FLIP_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

type Registration = {
  /** Measured to work out how far this node travelled. */
  card: HTMLElement;
  /** Moved to play that travel back. */
  row: HTMLElement;
  parentId: string | null;
  depth: number;
};

type TreeContextValue = {
  openPath: string[];
  toggle: (depth: number, id: string) => void;
  register: (id: string, registration: Registration | null) => void;
  scrollerRef: RefObject<HTMLElement | null>;
};

const TreeContext = createContext<TreeContextValue | null>(null);

function useTree() {
  const value = useContext(TreeContext);
  if (!value) throw new Error("Tree components must be rendered inside TreeNav");
  return value;
}

export function TreeNav({
  nodes,
  scrollerRef,
}: {
  nodes: TreeNode[];
  scrollerRef: RefObject<HTMLElement | null>;
}) {
  const [openPath, setOpenPath] = useState<string[]>([]);
  const registry = useRef(new Map<string, Registration>());
  const before = useRef<Map<string, DOMRect> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const register = useCallback((id: string, registration: Registration | null) => {
    if (registration) registry.current.set(id, registration);
    else registry.current.delete(id);
  }, []);

  const toggle = useCallback((depth: number, id: string) => {
    // Snapshot where everything is before React changes the layout.
    const snapshot = new Map<string, DOMRect>();
    for (const [key, entry] of registry.current) {
      snapshot.set(key, entry.card.getBoundingClientRect());
    }
    before.current = snapshot;

    setOpenPath((current) =>
      current[depth] === id ? current.slice(0, depth) : [...current.slice(0, depth), id],
    );
  }, []);

  /**
   * Branches hang out of the bottom of the tree without adding height to it,
   * which is what stops them shoving the sections around — but it also means
   * the scroller has nothing to scroll to. Pad the tree to reach past whatever
   * is hanging lowest, and leave a little room under it.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Read from the DOM, not the registry: branches register in a passive
    // effect, which has not run yet for anything that opened this commit.
    root.style.paddingBottom = "0px";
    const rootBottom = root.getBoundingClientRect().bottom;
    let lowest = rootBottom;
    for (const card of root.querySelectorAll(".tree-node")) {
      lowest = Math.max(lowest, card.getBoundingClientRect().bottom);
    }
    root.style.paddingBottom = `${Math.round(lowest - rootBottom) + BOTTOM_ROOM}px`;
  });

  useLayoutEffect(() => {
    const snapshot = before.current;
    before.current = null;
    if (!snapshot) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Measure everything first — reading positions after starting an animation
    // would return the animated values, not the settled ones.
    const after = new Map<string, DOMRect>();
    for (const [id, entry] of registry.current) {
      after.set(id, entry.card.getBoundingClientRect());
    }

    // Shallowest first, so a child's shift can be expressed relative to the
    // parent that already carries part of it.
    const ordered = [...registry.current.entries()].sort(
      (a, b) => a[1].depth - b[1].depth,
    );

    const travelled = new Map<string, { dx: number; dy: number }>();
    for (const [id, entry] of ordered) {
      const from = snapshot.get(id);
      const to = after.get(id);
      if (!from || !to) continue;
      if (entry.row.closest(".tree-kids.is-closing")) continue;

      const total = { dx: from.left - to.left, dy: from.top - to.top };
      travelled.set(id, total);

      // Transforms nest, so only animate the part the parent has not covered.
      const inherited = entry.parentId ? travelled.get(entry.parentId) : undefined;
      const dx = total.dx - (inherited?.dx ?? 0);
      const dy = total.dy - (inherited?.dy ?? 0);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

      entry.row.animate(
        [
          { transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: FLIP_MS, easing: FLIP_EASING },
      );
    }
  }, [openPath]);

  return (
    <TreeContext.Provider value={{ openPath, toggle, register, scrollerRef }}>
      <div
        ref={rootRef}
        className={`tree-root ${openPath.length === 0 ? "is-idle" : "is-engaged"}`}
      >
        {nodes.map((node, index) => (
          <div className="tree-row" key={node.id}>
            <Branch node={node} depth={0} index={index} parentId={null} onPath />
          </div>
        ))}
      </div>
    </TreeContext.Provider>
  );
}

function Branch({
  node,
  depth,
  index,
  parentId,
  onPath,
}: {
  node: TreeNode;
  depth: number;
  index: number;
  parentId: string | null;
  /** False once an ancestor was passed over in favour of a sibling. */
  onPath: boolean;
}) {
  const { openPath, toggle, register, scrollerRef } = useTree();
  const rowRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const kidsRef = useRef<HTMLDivElement>(null);

  const isOpen = openPath[depth] === node.id;
  const siblingChosen = Boolean(openPath[depth]) && !isOpen;
  const dimmed = !onPath || siblingChosen;

  const isAdd = node.variant === "add";
  const isInfo = node.variant === "info";
  const opensPanel = Boolean(node.onActivate);
  const allChildren = opensPanel ? [] : (node.children ?? []);
  const hasChildren = allChildren.length > 0;

  /**
   * The "add new" tile only belongs to the deepest list you have open. Once you
   * step into one of these rows, the tile at this level gets out of the way and
   * the one inside takes over — otherwise a long client list carries a dead
   * tile at every level you have walked past.
   */
  const childOpen = Boolean(openPath[depth + 1]);
  const children = childOpen
    ? allChildren.filter((child) => child.variant !== "add")
    : allChildren;

  /**
   * Children have to be in the DOM during the same commit that opens them,
   * otherwise the measurement above runs against a layout that has not changed
   * yet and nothing animates. `keepOpen` only extends their life on the way
   * out, for the closing wipe.
   */
  const [keepOpen, setKeepOpen] = useState(isOpen);
  const [revealed, setRevealed] = useState(isOpen);
  const mounted = isOpen || keepOpen;
  const closing = mounted && !isOpen;

  useEffect(() => {
    const row = rowRef.current;
    const card = cardRef.current;
    if (!row || !card) return;
    register(node.id, { card, row, parentId, depth });
    return () => register(node.id, null);
  }, [register, node.id, parentId, depth]);

  useEffect(() => {
    if (isOpen) {
      setKeepOpen(true);
      const timer = setTimeout(() => setRevealed(true), SLIDE_LEAD_MS);
      return () => clearTimeout(timer);
    }
    setRevealed(false);
    const timer = setTimeout(() => setKeepOpen(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Bring newly opened branches into view once they have drawn.
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => {
      const scroller = scrollerRef.current;
      const kids = kidsRef.current;
      if (scroller && kids) easeIntoView(scroller, kids);
    }, REVEAL_MS * 0.7);
    return () => clearTimeout(timer);
  }, [revealed, scrollerRef]);

  const label = depth === 0 ? String(index + 1).padStart(2, "0") : String(index + 1);
  const links = useLinkGeometry(cardRef, kidsRef, mounted, children.length);

  // The wrapper carries the same state as the card, so the remove control
  // travels with it on hover and the two never separate.
  const state = [
    depth === 0 ? "is-section" : "",
    isAdd ? "is-add" : "",
    isOpen ? "is-open" : "",
    isInfo ? "is-info" : "",
    !opensPanel && !hasChildren ? "is-leaf" : "",
    dimmed && !isAdd ? "is-dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="tree-branch" ref={rowRef}>
        <div className={`tree-card-wrap ${state}`}>
          <button
            type="button"
            ref={cardRef}
            className={`tree-node ${state}`}
            onClick={() => {
              if (opensPanel) node.onActivate?.();
              else if (hasChildren) toggle(depth, node.id);
            }}
            aria-expanded={hasChildren ? isOpen : undefined}
          >
            <span className="tree-node-index" aria-hidden>
              {isAdd ? "+" : label}
            </span>
            <span className="tree-node-body">
              <span className="tree-node-label">{node.label}</span>
              {node.detail ? <span className="tree-node-detail">{node.detail}</span> : null}
            </span>
            {hasChildren ? (
              <span className="tree-node-chevron" aria-hidden>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : isInfo ? (
              <span className="tree-node-chevron is-info" aria-hidden>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M4 5h8M4 8h8M4 11h5" strokeLinecap="round" />
                </svg>
              </span>
            ) : null}
          </button>

          {node.onRemove ? (
            <button
              type="button"
              className="tree-remove"
              aria-label={`Remove ${node.label}`}
              onClick={(event) => {
                event.stopPropagation();
                node.onRemove?.();
              }}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                <path d="m4.5 4.5 7 7m0-7-7 7" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>

        {hasChildren && mounted ? (
          <div
            ref={kidsRef}
            className={[
              "tree-kids",
              revealed && !closing ? "is-revealed" : "",
              revealed && !closing && !dimmed ? "is-active" : "",
              // Taken out of flow on the way out, so the row collapses now and
              // the siblings glide back while the branches wipe away.
              closing ? "is-closing" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <svg
              className="tree-links"
              width={LINK_WIDTH}
              height={links.height}
              viewBox={`0 0 ${LINK_WIDTH} ${Math.max(links.height, 1)}`}
              fill="none"
              aria-hidden
            >
              {links.paths.map((d, linkIndex) => (
                <path
                  key={linkIndex}
                  d={d}
                  pathLength={1}
                  className={
                    openPath[depth + 1] &&
                    openPath[depth + 1] !== children[linkIndex]?.id
                      ? "tree-link is-offpath"
                      : "tree-link"
                  }
                  style={{ transitionDelay: `${linkIndex * 70}ms` }}
                />
              ))}
            </svg>

            <div className="tree-kid-list">
              {children.map((child, childIndex) => {
                const childChosen = openPath[depth + 1];
                return (
                  <div
                    className={`tree-row ${
                      childChosen && childChosen !== child.id ? "is-offpath" : ""
                    }`}
                    key={child.id}
                    style={
                      {
                        "--stagger": `${childIndex * 80}ms`,
                      } as React.CSSProperties
                    }
                  >
                    <Branch
                      node={child}
                      depth={depth + 1}
                      index={childIndex}
                      parentId={node.id}
                      onPath={onPath && !siblingChosen}
                    />
                  </div>
                );
              })}
            </div>
          </div>
      ) : null}
    </div>
  );
}


/**
 * Works out where each connecting curve has to start and finish.
 *
 * The curves are drawn as one SVG per branch rather than as borders on each
 * row, so every line is the same weight and none of them can overlap.
 */
function useLinkGeometry(
  cardRef: RefObject<HTMLElement | null>,
  kidsRef: RefObject<HTMLElement | null>,
  mounted: boolean,
  childCount: number,
) {
  const [links, setLinks] = useState<{ paths: string[]; height: number }>({
    paths: [],
    height: 0,
  });

  useLayoutEffect(() => {
    const card = cardRef.current;
    const kids = kidsRef.current;
    if (!mounted || !card || !kids || childCount === 0) {
      setLinks({ paths: [], height: 0 });
      return;
    }

    function measure() {
      const list = kids!.querySelector<HTMLElement>(":scope > .tree-kid-list");
      const rows = kids!.querySelectorAll<HTMLElement>(":scope > .tree-kid-list > .tree-row");
      const firstCard = rows[0]?.querySelector<HTMLElement>(".tree-node");

      // Sit the first child a fixed distance above the parent's centre, so the
      // opening curve reads the same at every level regardless of card size.
      if (list && firstCard) {
        const lift =
          (card!.offsetHeight - firstCard.offsetHeight) / 2 - FIRST_CHILD_LIFT;
        list.style.marginTop = `${Math.round(lift)}px`;
      }

      const cardBox = card!.getBoundingClientRect();
      const kidsBox = kids!.getBoundingClientRect();

      // Where the curve leaves the parent card, in the gutter's coordinates.
      const from = cardBox.top + cardBox.height / 2 - kidsBox.top;
      const startX = -LINK_TUCK;
      const endX = LINK_WIDTH + LINK_TUCK;

      let lowest = from;
      const paths: string[] = [];

      rows.forEach((row) => {
        const target = row.querySelector<HTMLElement>(".tree-node") ?? row;
        const box = target.getBoundingClientRect();
        const to = box.top + box.height / 2 - kidsBox.top;
        lowest = Math.max(lowest, to);
        const bend = LINK_WIDTH * 0.52;
        paths.push(
          `M ${startX} ${from.toFixed(1)} C ${bend} ${from.toFixed(1)}, ${(
            LINK_WIDTH - bend
          ).toFixed(1)} ${to.toFixed(1)}, ${endX} ${to.toFixed(1)}`,
        );
      });

      setLinks({ paths, height: Math.ceil(lowest) + 2 });
    }

    measure();

    // Re-measure when a branch below changes the stack height.
    const observer = new ResizeObserver(measure);
    observer.observe(kids);
    for (const row of kids.querySelectorAll(":scope > .tree-kid-list > .tree-row")) {
      observer.observe(row);
    }
    return () => observer.disconnect();
  }, [cardRef, kidsRef, mounted, childCount]);

  return links;
}

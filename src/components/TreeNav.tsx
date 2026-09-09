"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { TreeNode } from "@/lib/navTree";
import { easeIntoView } from "@/lib/useSpringScroll";

/**
 * A sideways tree. Pressing a node opens its branches to the right with a
 * left-to-right wipe; pressing it again closes them, which is how you go back.
 *
 * `openPath` holds the id chosen at each depth, so only one branch per level is
 * open at a time and the tree stays readable.
 */

const REVEAL_MS = 520;

export function TreeNav({
  nodes,
  scrollerRef,
}: {
  nodes: TreeNode[];
  scrollerRef: RefObject<HTMLElement | null>;
}) {
  const [openPath, setOpenPath] = useState<string[]>([]);

  function toggle(depth: number, id: string) {
    setOpenPath((current) =>
      current[depth] === id ? current.slice(0, depth) : [...current.slice(0, depth), id],
    );
  }

  return (
    <div className="tree-root">
      {nodes.map((node) => (
        <div className="tree-row" key={node.id}>
          <Branch
            node={node}
            depth={0}
            openPath={openPath}
            onToggle={toggle}
            scrollerRef={scrollerRef}
          />
        </div>
      ))}
    </div>
  );
}

function Branch({
  node,
  depth,
  openPath,
  onToggle,
  scrollerRef,
}: {
  node: TreeNode;
  depth: number;
  openPath: string[];
  onToggle: (depth: number, id: string) => void;
  scrollerRef: RefObject<HTMLElement | null>;
}) {
  const isOpen = openPath[depth] === node.id;
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  const branchRef = useRef<HTMLDivElement>(null);

  // Children stay mounted through the closing wipe, then come out of the tree.
  const [mounted, setMounted] = useState(isOpen);
  const [revealed, setRevealed] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(raf);
    }
    setRevealed(false);
    const timer = setTimeout(() => setMounted(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Once the branches are out, bring them into view if they opened off-screen.
  useEffect(() => {
    if (!revealed || !scrollerRef.current || !branchRef.current) return;
    const timer = setTimeout(() => {
      if (scrollerRef.current && branchRef.current) {
        easeIntoView(scrollerRef.current, branchRef.current);
      }
    }, REVEAL_MS * 0.55);
    return () => clearTimeout(timer);
  }, [revealed, scrollerRef]);

  return (
    <div className="tree-branch" ref={branchRef}>
      <button
        type="button"
        className={`tree-node ${depth === 0 ? "is-section" : ""} ${isOpen ? "is-open" : ""} ${
          hasChildren ? "" : "is-leaf"
        }`}
        onClick={() => hasChildren && onToggle(depth, node.id)}
        aria-expanded={hasChildren ? isOpen : undefined}
      >
        <span className="tree-node-body">
          <span className="tree-node-label">{node.label}</span>
          {node.detail ? <span className="tree-node-detail">{node.detail}</span> : null}
        </span>
        {hasChildren ? (
          <span className="tree-node-chevron" aria-hidden>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m6 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : null}
      </button>

      {hasChildren && mounted ? (
        <div className={`tree-kids ${revealed ? "is-revealed" : ""}`}>
          <div className="tree-kid-list">
            {children.map((child, index) => (
              <div
                className="tree-row"
                key={child.id}
                style={{ transitionDelay: `${revealed ? index * 70 : 0}ms` }}
              >
                <Branch
                  node={child}
                  depth={depth + 1}
                  openPath={openPath}
                  onToggle={onToggle}
                  scrollerRef={scrollerRef}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

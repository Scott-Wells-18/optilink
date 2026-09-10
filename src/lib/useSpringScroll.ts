"use client";

import { useEffect, type RefObject } from "react";

/**
 * Scrolling that eases in and eases out.
 *
 * A wheel notch nudges a target; every frame the actual scroll position is
 * pulled toward that target by a critically damped spring, so movement builds
 * up gently and settles gently instead of snapping. Touch scrolling is left
 * alone — it already has its own momentum.
 */

/**
 * Stiff enough to keep up with the wheel — the spring is here to smooth the
 * steps between notches, not to add a delay.
 */
const STIFFNESS = 620;
const DAMPING = 2 * Math.sqrt(STIFFNESS); // critically damped: no overshoot
const LINE_HEIGHT = 40;
const PAGE_HEIGHT = 800;
/** How far one wheel notch travels. */
const WHEEL_GAIN = 2.6;

type Axis = { target: number; current: number; velocity: number };

export function useSpringScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    const element: HTMLElement = target;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const y: Axis = { target: element.scrollTop, current: element.scrollTop, velocity: 0 };
    const x: Axis = { target: element.scrollLeft, current: element.scrollLeft, velocity: 0 };

    let frame: number | null = null;
    let lastTime = 0;
    /**
     * Scroll events fire asynchronously, so a plain "we are driving" flag is
     * already false by the time the event for our own write arrives — which
     * used to reset the target mid-glide and make every scroll stutter to a
     * halt. Comparing against the last value written tells the two apart.
     */
    let writtenY = -1;
    let writtenX = -1;

    const maxY = () => Math.max(0, element.scrollHeight - element.clientHeight);
    const maxX = () => Math.max(0, element.scrollWidth - element.clientWidth);
    const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

    function step(axis: Axis, dt: number) {
      const displacement = axis.target - axis.current;
      axis.velocity += (displacement * STIFFNESS - axis.velocity * DAMPING) * dt;
      axis.current += axis.velocity * dt;
      const settled = Math.abs(displacement) < 0.3 && Math.abs(axis.velocity) < 6;
      if (settled) {
        axis.current = axis.target;
        axis.velocity = 0;
      }
      return settled;
    }

    function tick(time: number) {
      // Clamp dt so a backgrounded tab does not fling the page on return.
      const dt = Math.min((time - lastTime) / 1000, 1 / 30) || 1 / 60;
      lastTime = time;

      const doneY = step(y, dt);
      const doneX = step(x, dt);

      // Whole pixels only — fractional scroll offsets read as a shimmer.
      element.scrollTop = Math.round(y.current);
      element.scrollLeft = Math.round(x.current);
      writtenY = element.scrollTop;
      writtenX = element.scrollLeft;

      if (doneY && doneX) {
        frame = null;
        return;
      }
      frame = requestAnimationFrame(tick);
    }

    function start() {
      if (frame !== null) return;
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }

    function onWheel(event: WheelEvent) {
      if (event.ctrlKey) return; // pinch-zoom
      const scale =
        event.deltaMode === 1 ? LINE_HEIGHT : event.deltaMode === 2 ? PAGE_HEIGHT : 1;
      const dy = event.deltaY * scale * WHEEL_GAIN;
      const dx = event.deltaX * scale * WHEEL_GAIN;

      const canScrollY = maxY() > 0 && dy !== 0;
      const canScrollX = maxX() > 0 && dx !== 0;
      if (!canScrollY && !canScrollX) return;

      event.preventDefault();
      if (canScrollY) y.target = clamp(y.target + dy, maxY());
      if (canScrollX) x.target = clamp(x.target + dx, maxX());
      start();
    }

    /** Keep the target honest when something else moves the scroller. */
    function onScroll() {
      const movedY = Math.abs(element.scrollTop - writtenY) > 1;
      const movedX = Math.abs(element.scrollLeft - writtenX) > 1;
      if (!movedY && !movedX) return; // our own write coming back to us

      if (movedY) {
        y.target = y.current = element.scrollTop;
        y.velocity = 0;
      }
      if (movedX) {
        x.target = x.current = element.scrollLeft;
        x.velocity = 0;
      }
    }

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("scroll", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [ref]);
}

/**
 * Eases an element into view inside a scroller — used when a branch opens and
 * its children land off-screen.
 */
export function easeIntoView(
  scroller: HTMLElement,
  element: HTMLElement,
  duration = 420,
) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollerBox = scroller.getBoundingClientRect();
  const box = element.getBoundingClientRect();

  const padding = 48;
  let deltaX = 0;
  if (box.right > scrollerBox.right - padding) {
    deltaX = box.right - scrollerBox.right + padding;
  } else if (box.left < scrollerBox.left + padding) {
    deltaX = box.left - scrollerBox.left - padding;
  }

  let deltaY = 0;
  if (box.bottom > scrollerBox.bottom - padding) {
    deltaY = box.bottom - scrollerBox.bottom + padding;
  } else if (box.top < scrollerBox.top + padding) {
    deltaY = box.top - scrollerBox.top - padding;
  }

  if (deltaX === 0 && deltaY === 0) return;

  const fromX = scroller.scrollLeft;
  const fromY = scroller.scrollTop;
  const toX = Math.max(0, Math.min(fromX + deltaX, scroller.scrollWidth - scroller.clientWidth));
  const toY = Math.max(0, Math.min(fromY + deltaY, scroller.scrollHeight - scroller.clientHeight));

  if (reduced) {
    scroller.scrollLeft = toX;
    scroller.scrollTop = toY;
    return;
  }

  const started = performance.now();
  function frame(now: number) {
    const t = Math.min((now - started) / duration, 1);
    // Slow to start, slow to stop.
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    scroller.scrollLeft = fromX + (toX - fromX) * eased;
    scroller.scrollTop = fromY + (toY - fromY) * eased;
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

/**
 * Counts up to `value` when scrolled into view. Accepts a numeric value and
 * renders it with an optional suffix (e.g. "%", " XP").
 */
export function CountUp({
  value,
  suffix = "",
  prefix = "",
  decimals = 0,
  duration = 1.1,
  className,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const reduce = useReducedMotion();
  const from = useRef(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const format = (n: number) => `${prefix}${n.toFixed(decimals)}${suffix}`;
    if (reduce || !inView) {
      node.textContent = format(reduce ? value : from.current);
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        node.textContent = format(latest);
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, inView, reduce, duration, decimals, prefix, suffix]);

  return (
    <span ref={ref} className={className}>
      {`${prefix}${(reduce ? value : 0).toFixed(decimals)}${suffix}`}
    </span>
  );
}

/**
 * Tracks the pointer over any `.surface` card and exposes its position as
 * `--mx` / `--my` CSS variables, which drive the spotlight glow in global.css.
 * A single delegated listener keeps this cheap regardless of card count.
 */
export function SpotlightTracker() {
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.(".surface") as HTMLElement | null;
      if (!card) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        card.style.setProperty("--my", `${event.clientY - rect.top}px`);
      });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

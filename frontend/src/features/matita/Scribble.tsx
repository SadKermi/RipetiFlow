// «Matita sta scrivendo»: a wavy graphite stroke drawn under the line (02 §8: stroke-dashoffset,
// `--rf-dur-think` per cycle, at most 3 cycles, then it stays). With reduced motion the duration
// token is 0: the stroke is a still dotted line, nothing moves.
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/utils";

const PATH =
  "M0 6 C 20 1, 30 9, 50 5 S 80 2, 100 6 S 140 9, 160 4 S 200 2, 220 6 S 260 9, 280 5 S 320 2, 340 6 S 380 8, 400 5";

function thinkDurationMs(): number {
  if (typeof window.getComputedStyle !== "function") return 0;
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--rf-dur-think")
    .trim();
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return value.endsWith("ms") ? n : n * 1000;
}

export function Scribble({ className }: { className?: string }) {
  const pathRef = useRef<SVGPathElement>(null);
  // Decided once: reduced motion (or no Web Animations) → a still dotted line.
  const [duration] = useState(() =>
    typeof Element.prototype.animate === "function" ? thinkDurationMs() : 0,
  );
  const still = duration === 0;

  useEffect(() => {
    const path = pathRef.current;
    if (!path || duration === 0) return;
    const animation = path.animate(
      [{ strokeDashoffset: 1 }, { strokeDashoffset: 0, offset: 0.6 }, { strokeDashoffset: 0 }],
      { duration, iterations: 3, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" },
    );
    return () => animation.cancel();
  }, [duration]);

  return (
    <svg
      aria-hidden
      viewBox="0 0 400 10"
      preserveAspectRatio="none"
      className={cx("pointer-events-none h-2.5 overflow-visible text-pencil", className)}
    >
      <path
        ref={pathRef}
        d={PATH}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={still ? "0.008 0.012" : 1}
        strokeDashoffset={still ? 0 : 1}
      />
    </svg>
  );
}

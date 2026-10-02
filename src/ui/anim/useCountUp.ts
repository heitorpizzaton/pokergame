import { useEffect, useRef, useState } from 'react';

/**
 * A number that counts up (or down) to `target` over `durationMs` (AGENTS.md §31.1.6). With a
 * duration of 0 (reduced motion, instant speed) it follows the target immediately. Values stay
 * integers: chips are never shown as fractions.
 */
export function useCountUp(target: number, durationMs: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    if (durationMs <= 0 || typeof requestAnimationFrame === 'undefined') {
      from.current = target;
      setShown(target);
      return;
    }
    const start = from.current;
    if (start === target) return;
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const value = Math.round(start + (target - start) * eased);
      from.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [target, durationMs]);

  return durationMs <= 0 ? target : shown;
}

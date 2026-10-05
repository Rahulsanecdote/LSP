"use client";

import { useEffect, useState } from "react";

/** Rolling one-second average frame rate from requestAnimationFrame; published twice a second. */
export function useFps(): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let raf = 0;
    let lastPublish = performance.now();
    const stamps: number[] = [];
    const tick = (t: number) => {
      stamps.push(t);
      while (stamps.length && t - (stamps[0] as number) > 1000) stamps.shift();
      if (t - lastPublish > 500) {
        const span = stamps.length > 1 ? t - (stamps[0] as number) : 0;
        setFps(span > 0 ? Math.round(((stamps.length - 1) * 1000) / span) : 0);
        lastPublish = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

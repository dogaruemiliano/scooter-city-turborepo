"use client";

import { useLayoutEffect, useState } from "react";
import { spacing } from "@repo/theme";

/** Reserve room for floating controls without clipping the image beneath them. */
export function useImageEditorLayout() {
  const [header, headerRef] = useState<HTMLElement | null>(null);
  const [controls, controlsRef] = useState<HTMLDivElement | null>(null);
  const [insets, setInsets] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });
  useLayoutEffect(() => {
    if (!header || !controls) return;
    const measure = () => {
      const top = header.getBoundingClientRect().height;
      const bottom = controls.getBoundingClientRect().height;
      const style = window.getComputedStyle(header);
      const left = Math.max(
        0,
        (Number.parseFloat(style.paddingLeft) || 0) - spacing[4],
      );
      const right = Math.max(
        0,
        (Number.parseFloat(style.paddingRight) || 0) - spacing[4],
      );
      setInsets((previous) =>
        previous.top === top &&
        previous.bottom === bottom &&
        previous.left === left &&
        previous.right === right
          ? previous
          : { top, bottom, left, right },
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(header);
    observer?.observe(controls);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [header, controls]);
  return { headerRef, controlsRef, insets };
}

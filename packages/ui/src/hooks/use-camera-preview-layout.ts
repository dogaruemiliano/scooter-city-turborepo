"use client";

import { spacing } from "@repo/theme";
import { useEffect, useRef, useState } from "react";
import { fitCameraPreview } from "@repo/ui/lib/camera-preview-layout";

export function useCameraPreviewLayout(
  enabled: boolean,
  frameSize: { width: number; height: number } | undefined,
) {
  const stageRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const controlsRef = useRef<HTMLElement>(null);
  const [space, setSpace] = useState({
    width: 0,
    height: 0,
    top: 0,
    bottom: 0,
  });

  useEffect(() => {
    if (!enabled) return;
    const stage = stageRef.current;
    const header = headerRef.current;
    const controls = controlsRef.current;
    if (!stage || !header || !controls) return;
    const measure = () => {
      const stageRect = stage.getBoundingClientRect();
      const next = {
        width: stageRect.width,
        height: stageRect.height,
        top: header.getBoundingClientRect().height,
        bottom: controls.getBoundingClientRect().height,
      };
      setSpace((previous) =>
        previous.width === next.width &&
        previous.height === next.height &&
        previous.top === next.top &&
        previous.bottom === next.bottom
          ? previous
          : next,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    [stage, header, controls].forEach((element) => observer?.observe(element));
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled, frameSize?.width, frameSize?.height]);

  const layout = frameSize
    ? fitCameraPreview({
        containerWidth: space.width,
        containerHeight: space.height,
        sourceWidth: frameSize.width,
        sourceHeight: frameSize.height,
        topControlsHeight: space.top,
        bottomControlsHeight: space.bottom,
        gap: spacing[2],
      })
    : null;
  return { stageRef, headerRef, controlsRef, layout };
}

"use client";

import { motion, softFade } from "@repo/theme";
import { XIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";

export type DocumentPreviewHeaderProps = {
  headerOverlay?: ReactNode;
  caption?: string;
  captionStatus?: string;
  onClosePress?: () => void;
  closeLabel?: string;
  headerActions?: ReactNode;
};

/** Shared overlay for inline and fullscreen image/PDF previews. */
export function DocumentPreviewHeader({
  caption,
  captionStatus,
  headerOverlay,
  onClosePress,
  closeLabel,
  headerActions,
}: DocumentPreviewHeaderProps) {
  if (headerOverlay)
    return (
      <div
        data-slot="document-preview-header"
        style={{ backgroundImage: softFade.toTop }}
        className="pointer-events-none absolute inset-x-0 top-0 z-raised flex min-w-0 items-start justify-between gap-2 px-1.5 pt-[max(var(--spacing-1-5),env(safe-area-inset-top))] pb-6 text-scrim-foreground *:pointer-events-auto"
      >
        {headerOverlay}
      </div>
    );
  if (!caption && !onClosePress && !headerActions) return null;
  return (
    <div
      data-slot="document-preview-header"
      className="absolute top-[max(var(--spacing-3),env(safe-area-inset-top))] right-3 left-3 z-raised grid grid-cols-[var(--spacing-11)_minmax(0,1fr)_auto] items-center gap-2 text-foreground"
    >
      <div className="flex items-center justify-center">
        {onClosePress ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 min-h-11 rounded-xl border-document-overlay-border bg-document-overlay shadow-sm hover:bg-document-overlay"
            aria-label={closeLabel}
            onClick={onClosePress}
          >
            <XIcon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center justify-center gap-2">
        {caption ? <ScrollingDocumentName name={caption} /> : null}
        {captionStatus ? (
          <span
            role="status"
            className="shrink-0 whitespace-nowrap rounded-xl border border-document-overlay-border bg-document-overlay px-2 py-1 text-xs tabular-nums shadow-sm"
          >
            {captionStatus}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-11 items-center justify-center">
        {headerActions ? (
          <div className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-document-overlay-border bg-document-overlay shadow-sm">
            {headerActions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScrollingDocumentName({ name }: { name: string }) {
  const container = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const viewport = container.current;
    const label = text.current;
    if (!viewport || !label) return;
    const measure = () =>
      setOverflow(Math.max(0, label.scrollWidth - viewport.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(label);
    return () => observer.disconnect();
  }, [name]);

  useEffect(() => {
    const label = text.current;
    if (!label || !overflow || reducedMotion || hovered || focused) return;
    if (container.current) container.current.scrollLeft = 0;
    // Hold at either end so users can read the start and the file extension.
    const animation = label.animate?.(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: 0.15 },
        { transform: `translateX(${-overflow}px)`, offset: 0.85 },
        { transform: `translateX(${-overflow}px)`, offset: 1 },
      ],
      {
        duration: motion.duration.documentNameScroll,
        easing: motion.easing.linear,
        direction: "alternate",
        iterations: Infinity,
      },
    );
    return () => animation?.cancel();
  }, [name, overflow, reducedMotion, hovered, focused]);

  return (
    <div className="w-fit min-w-0 max-w-[min(100%,var(--spacing-96))] justify-self-center rounded-lg border border-document-overlay-border bg-document-overlay px-3 py-1.5 text-foreground shadow-sm">
      <div
        ref={container}
        title={name}
        data-slot="document-zoom-caption"
        data-scrolling={overflow > 0 && !reducedMotion && !hovered && !focused}
        tabIndex={overflow ? 0 : undefined}
        className="min-w-0 overflow-x-auto overflow-y-hidden rounded-sm text-center text-xs font-medium [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-ring"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <span ref={text} className="mx-auto block w-max whitespace-nowrap">
          {name}
        </span>
      </div>
    </div>
  );
}

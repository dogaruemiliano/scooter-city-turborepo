"use client";

import { spacing } from "@repo/theme";
import { useEffect, useRef, useState } from "react";
import { LoaderCircleIcon, ImageIcon } from "lucide-react";
import { Button } from "./button";

export type ImagePreviewProps = {
  src: string;
  alt: string;
  grid?: boolean;
  loadingLabel: string;
  errorLabel: string;
  retryLabel: string;
};

/** Fits the source without cropping; the grid follows the actual image bounds. */
export function ImagePreview(props: ImagePreviewProps) {
  return <ImagePreviewContent key={props.src} {...props} />;
}

function ImagePreviewContent({
  src,
  alt,
  grid,
  loadingLabel,
  errorLabel,
  retryLabel,
}: ImagePreviewProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () =>
      setBounds({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const ratio =
    natural.width && natural.height
      ? Math.min(bounds.width / natural.width, bounds.height / natural.height)
      : 0;
  return (
    <div
      ref={viewport}
      data-slot="image-preview"
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
    >
      <div
        className="relative shrink-0"
        style={{ width: natural.width * ratio, height: natural.height * ratio }}
      >
        <img
          key={`${src}:${attempt}`}
          src={src}
          alt={alt}
          draggable={false}
          className="block h-full w-full object-contain select-none [-webkit-user-drag:none]"
          onLoad={(event) => {
            setNatural({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            });
            setStatus("ready");
          }}
          onError={() => setStatus("error")}
        />
        {grid && status === "ready" ? (
          <svg
            aria-hidden="true"
            data-slot="image-grid"
            viewBox="0 0 3 3"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full fill-none"
          >
            {/* A narrow white outline around the dark center line. */}
            <path
              d="M1 0V3M2 0V3M0 1H3M0 2H3M0 0H3V3H0Z"
              stroke="var(--image-grid-outline)"
              strokeWidth={spacing[0.5]}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M1 0V3M2 0V3M0 1H3M0 2H3M0 0H3V3H0Z"
              stroke="var(--image-grid-line)"
              strokeWidth={spacing.px}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}
      </div>
      {status === "loading" ? (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center"
        >
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
          <span className="sr-only">{loadingLabel}</span>
        </div>
      ) : null}
      {status === "error" ? (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground"
        >
          <ImageIcon aria-hidden="true" className="size-6" />
          <p>{errorLabel}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setStatus("loading");
              setAttempt(attempt + 1);
            }}
          >
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

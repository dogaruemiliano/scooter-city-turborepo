"use client";

import { aspectRatio } from "@repo/theme";
import { IdCardIcon } from "lucide-react";

/** An alignment guide only: capture keeps the surrounding image for manual crop. */
export function IdentityCardGuide({
  description,
  portrait = false,
}: {
  description: string;
  portrait?: boolean;
}) {
  const ratio = portrait
    ? aspectRatio.identityCardPortrait
    : aspectRatio.documentLandscape;
  return (
    <div
      data-slot="identity-card-guide"
      role="img"
      aria-label={description}
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ containerType: "size" }}
    >
      <div
        className="relative rounded-xl border border-mist-50/40"
        style={{
          aspectRatio: ratio,
          width: `min(calc(100cqw - var(--spacing-8)), calc((100cqh - var(--spacing-4)) * ${ratio}))`,
        }}
      >
        <span className="absolute -top-px -left-px size-8 rounded-tl-xl border-t-2 border-l-2 border-mist-50" />
        <span className="absolute -top-px -right-px size-8 rounded-tr-xl border-t-2 border-r-2 border-mist-50" />
        <span className="absolute -bottom-px -left-px size-8 rounded-bl-xl border-b-2 border-l-2 border-mist-50" />
        <span className="absolute -right-px -bottom-px size-8 rounded-br-xl border-r-2 border-b-2 border-mist-50" />
      </div>
    </div>
  );
}

/** The card, rather than the phone, demonstrates the requested quarter-turn. */
export function IdentityCardOrientationCue({ hint }: { hint: string }) {
  return (
    <div
      data-slot="identity-card-orientation-cue"
      className="flex min-w-0 items-center gap-2 rounded-lg bg-mist-950/60 px-3 py-1"
    >
      <div
        className="relative flex size-12 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <span className="absolute h-6 w-9 rounded-md border border-dashed border-mist-50/40" />
        <span
          data-slot="identity-card-orientation-demo"
          className="relative flex h-6 w-9 rotate-90 items-center justify-center rounded-md border border-mist-50 bg-mist-50 text-mist-950"
        >
          <IdCardIcon className="size-5" />
        </span>
      </div>
      <p className="max-w-36 text-pretty text-sm font-medium text-mist-50">
        {hint}
      </p>
    </div>
  );
}

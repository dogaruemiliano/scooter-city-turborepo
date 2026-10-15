"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { webApi } from "@/lib/api";

export function ScooterCover({
  scooter,
}: {
  scooter: { coverUrl?: string | null };
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
      {scooter.coverUrl && !failed ? (
        // Private cover URLs must retain session cookies.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={webApi.url(scooter.coverUrl)}
          alt=""
          className="size-full object-contain"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageIcon
          aria-hidden="true"
          className="size-6 text-muted-foreground"
        />
      )}
    </span>
  );
}

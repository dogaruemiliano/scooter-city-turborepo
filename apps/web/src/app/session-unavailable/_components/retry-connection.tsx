"use client";

import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { LoaderCircle, RotateCw } from "lucide-react";

export function RetryConnection({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      className="w-full"
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        setPending(true);
        // The proxy rewrite preserves the original URL, including its query string.
        window.location.reload();
      }}
    >
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <RotateCw aria-hidden="true" />
      )}
      {pending ? pendingLabel : label}
    </Button>
  );
}

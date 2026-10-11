"use client";

import { useEffect, useState } from "react";

/** Own a local preview URL for the lifetime of the file, never during render. */
export function useObjectUrl(file: File | null): string | null {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(
    null,
  );
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Object URLs are external resources and must be allocated on commit.
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return preview?.file === file ? preview.url : null;
}

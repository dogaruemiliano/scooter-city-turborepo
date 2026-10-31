"use client";

import { v1 } from "@repo/api-shared";
import { webApi } from "./api";

/** Binary downloads remain authenticated and never persist a temporary URL. */
export async function downloadContractFile(path: string, filename: string) {
  await webApi.fetch(v1.auth.ROUTES.me, v1.auth.sessionUserSchema, {
    cache: "no-store",
  });
  const response = await fetch(webApi.url(path), {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  const extensions: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "application/zip": ".zip",
  };
  anchor.download = /\.[a-z0-9]+$/i.test(filename)
    ? filename
    : filename +
      (extensions[response.headers.get("content-type")?.split(";")[0] ?? ""] ??
        "");
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

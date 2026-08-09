import { createHash } from "node:crypto";

const MAX_CATEGORY_CODE_LENGTH = 80;

export function categoryCodeFromPath({
  kind,
  name,
  parentCode,
}: {
  kind: string;
  name: string;
  parentCode?: string | null;
}): string {
  return categoryCodeFromName(`${parentCode ?? kind} ${name}`);
}

export function categoryCodeFromName(name: string): string {
  const normalized = name
    .trim()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
  const slug = normalized.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const code = /^[A-Z]/.test(slug) ? slug : `CATEGORY_${slug}`;

  if (code !== "CATEGORY_") {
    return code.slice(0, MAX_CATEGORY_CODE_LENGTH).replace(/_+$/g, "");
  }

  const digest = createHash("sha256")
    .update(name.trim())
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return `CATEGORY_${digest}`;
}

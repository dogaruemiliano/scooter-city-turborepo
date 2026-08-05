import type { v1 } from "@repo/api-shared";

export function isPersonDocumentExpired(
  document: v1.persons.PersonDocument,
): boolean {
  if (document.status === "expired") {
    return true;
  }

  if (!document.expiresOn) {
    return false;
  }

  const expiryDate = dateOnlyToUtcTime(document.expiresOn);
  if (expiryDate == null) {
    return false;
  }

  const now = new Date();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return expiryDate < today;
}

function dateOnlyToUtcTime(value: string): number | null {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return Date.UTC(year, month - 1, day);
}

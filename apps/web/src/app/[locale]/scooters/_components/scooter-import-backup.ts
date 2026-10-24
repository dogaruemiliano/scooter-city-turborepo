import {
  readScooterImportSnapshot,
  type ScooterImportSnapshot,
} from "./scooter-import-workspace";

export interface ScooterImportBackup {
  owner: string;
  revision: number;
  signature: string;
  sentSignature?: string;
  state: ScooterImportSnapshot;
}
const key = (id: string) => `scooter-import:${id}:v1`;

/** Read only after the API has confirmed this user owns the draft. Backups stay in this tab. */
export function readScooterImportBackup(
  id: string,
): ScooterImportBackup | undefined {
  try {
    const raw = sessionStorage.getItem(key(id));
    if (!raw) return undefined;
    const value = JSON.parse(raw) as ScooterImportBackup;
    if (
      typeof value.owner !== "string" ||
      typeof value.signature !== "string" ||
      !Number.isInteger(value.revision) ||
      value.revision < 0 ||
      !value.state ||
      !readScooterImportSnapshot(
        value.state as unknown as Record<string, unknown>,
      )
    )
      return undefined;
    return value;
  } catch {
    return undefined;
  }
}
export function writeScooterImportBackup(
  id: string,
  backup: ScooterImportBackup,
  claim = false,
) {
  try {
    const previous = readScooterImportBackup(id);
    // A request finishing from an abandoned workspace cannot overwrite its replacement's edits.
    if (previous && previous.owner !== backup.owner && !claim) return;
    sessionStorage.setItem(key(id), JSON.stringify(backup));
  } catch {
    /* Server snapshots remain authoritative when browser storage is unavailable/full. */
  }
}
export function clearScooterImportBackup(id: string, owner?: string) {
  try {
    if (owner && readScooterImportBackup(id)?.owner !== owner) return;
    sessionStorage.removeItem(key(id));
  } catch {
    /* Browser storage may be disabled. */
  }
}

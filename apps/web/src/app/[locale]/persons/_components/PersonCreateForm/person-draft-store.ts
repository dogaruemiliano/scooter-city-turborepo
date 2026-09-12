import type { ExtractionState } from "./extraction-state";
import type { NationalIdFormat } from "./types";
import type { NavigationState } from "./useWizardNavigation";

export interface PersonDraft {
  version: 1;
  extraction: ExtractionState;
  navigation: NavigationState;
  nationalIdFormat: NationalIdFormat | null;
}

// Retain Files during route changes, even when persistent browser storage fails.
const memory = new Map<string, PersonDraft | null>();
let queue: Promise<unknown> = Promise.resolve();

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("person-create-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readPersonDraft(
  owner: string,
): Promise<PersonDraft | null> {
  if (memory.has(owner)) return memory.get(owner) ?? null;
  try {
    await queue;
    const db = await database();
    const value = await new Promise<PersonDraft | undefined>(
      (resolve, reject) => {
        const transaction = db.transaction("drafts", "readonly");
        const request = transaction.objectStore("drafts").get(owner);
        transaction.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        transaction.onabort = () => {
          db.close();
          reject(transaction.error);
        };
      },
    );
    const draft = value?.version === 1 ? value : null;
    if (!memory.has(owner)) memory.set(owner, draft);
    return memory.get(owner) ?? null;
  } catch {
    return null;
  }
}

export function writePersonDraft(
  owner: string,
  draft: PersonDraft | null,
): Promise<void> {
  memory.set(owner, draft);
  const write = queue
    .catch(() => {})
    .then(async () => {
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("drafts", "readwrite");
        const store = transaction.objectStore("drafts");
        if (draft) store.put(draft, owner);
        else store.delete(owner);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onabort = () => {
          db.close();
          reject(transaction.error);
        };
      });
    });
  queue = write;
  return write;
}

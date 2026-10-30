"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  emptyRentalDraft,
  canPersistRentalDraft,
  readRentalDraft,
  writeRentalDraft,
  removeRentalDraft,
  rentalDraftKey,
  type RentalDraft,
} from "../_lib/rental-draft";

type Snapshot = { draft: RentalDraft; storageError: boolean };
const serverSnapshot = () => null;
// Preserve the pristine form during an Add person round trip without writing
// an empty draft. Explicit user input is autosaved at every step.
const personHandoffs = new Map<string, RentalDraft>();

function createStore(userId: string, draftId?: string, personId?: string) {
  let snapshot: Snapshot | undefined;
  const listeners = new Set<() => void>();
  function getSnapshot(): Snapshot {
    if (snapshot) return snapshot;
    let draft: RentalDraft;
    let storageError = false;
    try {
      const stored = readRentalDraft(userId);
      draft =
        (stored && canPersistRentalDraft(stored) ? stored : null) ??
        personHandoffs.get(userId) ??
        emptyRentalDraft();
    } catch {
      draft = emptyRentalDraft();
      storageError = true;
    }
    if (draftId === draft.id && personId && !draft.createdRentalId)
      draft = { ...draft, personId, inputTouched: true, step: "details" };
    snapshot = { draft, storageError };
    return snapshot;
  }
  function emit() {
    listeners.forEach((listener) => listener());
  }
  function update(patch: Partial<RentalDraft>): boolean {
    const previous = getSnapshot().draft;
    const inputTouched =
      previous.inputTouched ||
      Object.keys(patch).some((key) =>
        [
          "personId",
          "scooterId",
          "startDate",
          "promotion",
          "conclusionContext",
          "rentalPaymentMethod",
          "depositPaymentMethod",
          "driverPersonIds",
          "renterDrives",
          "customerNotes",
          "internalNotes",
        ].includes(key),
      );
    const draft = {
      ...previous,
      ...patch,
      ...(inputTouched ? { inputTouched: true } : {}),
    };
    let storageError = false;
    try {
      const stored = readRentalDraft(userId);
      if (stored && canPersistRentalDraft(stored) && stored.id !== draft.id)
        throw new Error("Another rental draft is open");
      writeRentalDraft(userId, draft);
    } catch {
      storageError = true;
    }
    snapshot = { draft, storageError };
    emit();
    return !storageError;
  }
  function preparePersonCreation(): boolean {
    if (!update({})) return false;
    if (!canPersistRentalDraft(getSnapshot().draft))
      personHandoffs.set(userId, getSnapshot().draft);
    return true;
  }
  function discard(): boolean {
    try {
      removeRentalDraft(userId, getSnapshot().draft.id);
      if (personHandoffs.get(userId)?.id === getSnapshot().draft.id)
        personHandoffs.delete(userId);
      return true;
    } catch {
      snapshot = { ...getSnapshot(), storageError: true };
      emit();
      return false;
    }
  }
  return {
    getSnapshot,
    update,
    discard,
    preparePersonCreation,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (personHandoffs.get(userId)?.id === getSnapshot().draft.id)
        personHandoffs.delete(userId);
      // Persist the returned person before clearing their URL parameters.
      if (draftId === getSnapshot().draft.id && personId) update({});
      const onStorage = (event: StorageEvent) => {
        if (event.key !== rentalDraftKey(userId) && event.key !== null) return;
        snapshot = undefined;
        emit();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

export function useRentalDraft(
  userId: string,
  returned: { draftId?: string; personId?: string },
) {
  const draftId = returned?.draftId;
  const personId = returned?.personId;
  const store = useMemo(
    () => createStore(userId, draftId, personId),
    [userId, draftId, personId],
  );
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    serverSnapshot,
  );
  return {
    draft: state?.draft ?? null,
    storageError: state?.storageError ?? false,
    update: store.update,
    discard: store.discard,
    preparePersonCreation: store.preparePersonCreation,
  };
}

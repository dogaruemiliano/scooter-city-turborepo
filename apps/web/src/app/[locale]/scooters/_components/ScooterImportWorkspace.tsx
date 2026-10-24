"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  Spinner,
  FileDropZone,
  HorizontalScrollArea,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  buttonVariants,
} from "@repo/ui/components";
import { SaveButton } from "@repo/ui/components/save-button";
import { PageLayout } from "@repo/ui/components/page-layout";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { webApi } from "@/lib/api";
import type { CivVocabulary } from "./CivVocabularyContext";
import {
  readScooterImportBackup,
  writeScooterImportBackup,
  clearScooterImportBackup,
} from "./scooter-import-backup";
import { ScooterEditor } from "./ScooterEditor";
import {
  compactScooterImportSnapshot,
  mergeScooterImportSnapshots,
  scooterImportIdentity,
  scooterImportHasManualValues,
  scooterImportStateSignature,
  readScooterImportSnapshot,
  type ScooterImportSnapshot,
  type ScooterImportStatus,
} from "./scooter-import-workspace";

const draftStatusColors: Record<ScooterImportStatus, string> = {
  empty: "border-border bg-control text-muted-foreground hover:bg-muted",
  uploading: "border-info/30 bg-info-subtle text-info hover:bg-info-subtle",
  queued: "border-info/30 bg-info-subtle text-info hover:bg-info-subtle",
  analysing: "border-info/30 bg-info-subtle text-info hover:bg-info-subtle",
  review:
    "border-warning/30 bg-warning-subtle text-warning hover:bg-warning-subtle",
  attention:
    "border-destructive/30 bg-destructive-subtle text-destructive hover:bg-destructive-subtle",
  ready:
    "border-success/30 bg-success-subtle text-success hover:bg-success-subtle",
  created:
    "border-success/30 bg-success-subtle text-success hover:bg-success-subtle",
};

interface WorkspaceDraft {
  draft: v1.scooters.ScooterImportDraft;
  initialSnapshot?: ScooterImportSnapshot;
  restoreFailed?: boolean;
  status: ScooterImportStatus;
  incomingFiles?: { id: string; files: File[] };
  generation?: number;
  identity?: string | null;
}
interface PendingSave {
  draft: v1.scooters.ScooterImportDraft;
  state: ScooterImportSnapshot;
  signature: string;
  savedSignature: string;
  sentSignature?: string;
  running: boolean;
  blocked: boolean;
  resume?: boolean;
}

export function ScooterImportWorkspace({
  scootersHref,
  brands,
  vocabulary,
}: {
  scootersHref: string;
  brands: v1.scooterBrands.ScooterBrand[];
  vocabulary?: CivVocabulary;
}) {
  const t = useTranslations("scooters.workspace");
  const uploadBatchRunning = useRef(false);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [workspaceOwner] = useState(() => crypto.randomUUID());
  const [drafts, setDrafts] = useState<WorkspaceDraft[]>([]);
  const [merging, setMerging] = useState<string[]>([]);
  const grouping = useRef(false);
  const failedGroups = useRef(new Set<string>());
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [discarding, setDiscarding] = useState<string>();
  const [error, setError] = useState<string>();
  const [savingRecovery, setSavingRecovery] = useState(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [revisionConflicts, setRevisionConflicts] = useState<string[]>([]);
  const [created, setCreated] = useState<v1.scooters.Scooter[]>([]);
  const pending = useRef(new Map<string, PendingSave>());
  const closed = useRef(new Set<string>());
  const mounted = useRef(true);

  const add = useCallback(
    async (files?: File[]) => {
      setAdding(true);
      setShowRecovery(false);
      setError(undefined);
      try {
        const draft = await webApi.fetch(
          v1.scooters.ROUTES.importDrafts.create,
          v1.scooters.scooterImportDraftSchema,
          { method: "POST", json: {} },
        );
        if (!mounted.current) return;
        setDrafts((items) => [
          ...items,
          {
            draft,
            status: "empty",
            ...(files?.length
              ? { incomingFiles: { id: crypto.randomUUID(), files } }
              : {}),
          },
        ]);
        setSelectedId(draft.id);
      } catch (cause) {
        if (mounted.current)
          setError(
            t(
              cause instanceof ApiError &&
                cause.code === "IMPORT_DRAFT_LIMIT_REACHED"
                ? "limitReached"
                : "loadFailed",
            ),
          );
      } finally {
        if (mounted.current) setAdding(false);
      }
    },
    [t],
  );
  const initialized = useRef(false);
  useEffect(() => {
    mounted.current = true;
    // Strict Mode's effect probe must not create two sessions.
    if (!initialized.current) {
      initialized.current = true;
      void webApi
        .fetch(
          v1.scooters.ROUTES.importDrafts.list,
          v1.scooters.scooterImportDraftListSchema,
          { cache: "no-store" },
        )
        .then(async ({ items }) => {
          if (!mounted.current) return;
          if (items.length) {
            const restored = items.map((draft) => {
              const backup = readScooterImportBackup(draft.id);
              const serverSignature = scooterImportStateSignature(draft.state);
              const recover = backup && backup.signature !== serverSignature;
              const conflict = Boolean(
                recover &&
                backup.revision !== draft.revision &&
                backup.sentSignature !== serverSignature,
              );
              const initialSnapshot = recover
                ? backup.state
                : readScooterImportSnapshot(draft.state);
              if (recover) {
                const state = compactScooterImportSnapshot(backup.state);
                const item: PendingSave = {
                  draft,
                  state,
                  signature: scooterImportStateSignature(state),
                  savedSignature: serverSignature,
                  running: false,
                  blocked: conflict,
                  resume: !conflict,
                };
                pending.current.set(draft.id, item);
                writeScooterImportBackup(
                  draft.id,
                  {
                    owner: workspaceOwner,
                    revision: draft.revision,
                    state,
                    signature: item.signature,
                  },
                  true,
                );
                if (conflict) {
                  setRevisionConflicts((ids) => [...ids, draft.id]);
                  setShowRecovery(true);
                  setRecoveryBlocked(true);
                  setError(t("revisionConflict"));
                }
              } else if (backup) clearScooterImportBackup(draft.id);

              return {
                draft,
                identity: initialSnapshot
                  ? scooterImportIdentity(initialSnapshot)
                  : null,
                initialSnapshot,
                restoreFailed:
                  Object.keys(draft.state).length > 0 && !initialSnapshot,
                status:
                  initialSnapshot?.status ??
                  (Object.keys(draft.state).length > 0
                    ? ("attention" as const)
                    : ("empty" as const)),
              };
            });
            setDrafts(restored);
            setSelectedId(items[0]!.id);
          } else await add();
        })
        .catch(() => {
          if (mounted.current) setError(t("loadFailed"));
        })
        .finally(() => {
          if (mounted.current) setLoading(false);
        });
    }
    return () => {
      mounted.current = false;
    };
  }, [add, t, workspaceOwner]);

  const persist = useCallback(
    async (item: PendingSave) => {
      if (item.running || item.blocked || closed.current.has(item.draft.id))
        return;
      item.running = true;
      try {
        while (
          item.signature !== item.savedSignature &&
          !closed.current.has(item.draft.id) &&
          mounted.current
        ) {
          const signature = item.signature;
          const payload = { revision: item.draft.revision, state: item.state };
          const keepalive =
            document.visibilityState === "hidden" &&
            new TextEncoder().encode(JSON.stringify(payload)).byteLength <
              60_000;
          item.sentSignature = signature;
          writeScooterImportBackup(item.draft.id, {
            owner: workspaceOwner,
            revision: item.draft.revision,
            state: item.state,
            signature: item.signature,
            sentSignature: signature,
          });
          let result: v1.scooters.ScooterImportDraft;
          try {
            result = await webApi.fetch(
              v1.scooters.ROUTES.importDrafts.update(item.draft.id),
              v1.scooters.scooterImportDraftSchema,
              { method: "PATCH", json: payload, keepalive },
            );
          } catch (cause) {
            if (
              !(cause instanceof ApiError) ||
              cause.code !== "IMPORT_DRAFT_REVISION_CONFLICT"
            )
              throw cause;
            const current = await webApi.fetch(
              v1.scooters.ROUTES.importDrafts.get(item.draft.id),
              v1.scooters.scooterImportDraftSchema,
              { cache: "no-store" },
            );
            // A response can be lost after the server committed this exact request.
            if (scooterImportStateSignature(current.state) !== signature)
              throw cause;
            result = current;
          }
          item.draft = result;
          item.savedSignature = signature;
          item.sentSignature = undefined;
          if (item.signature === signature)
            clearScooterImportBackup(item.draft.id, workspaceOwner);
          else
            writeScooterImportBackup(item.draft.id, {
              owner: workspaceOwner,
              revision: result.revision,
              state: item.state,
              signature: item.signature,
            });
        }
        if (
          mounted.current &&
          [...pending.current.values()].every(
            (entry) =>
              !entry.blocked && entry.signature === entry.savedSignature,
          )
        )
          setError(undefined);
      } catch (cause) {
        if (closed.current.has(item.draft.id)) return;
        // A second tab's edits must never be silently overwritten.
        item.blocked =
          cause instanceof ApiError &&
          cause.code === "IMPORT_DRAFT_REVISION_CONFLICT";
        if (item.blocked && mounted.current)
          setRevisionConflicts((ids) => [...new Set([...ids, item.draft.id])]);
        if (mounted.current) {
          setShowRecovery(true);
          setRecoveryBlocked(item.blocked);
          setError(t(item.blocked ? "revisionConflict" : "saveFailed"));
        }
      } finally {
        item.running = false;
      }
    },
    [t, workspaceOwner],
  );

  const snapshot = useCallback(
    (draft: v1.scooters.ScooterImportDraft, state: ScooterImportSnapshot) => {
      if (closed.current.has(draft.id)) return;
      const identity = scooterImportIdentity(state);
      state = compactScooterImportSnapshot({
        ...state,
        assignment:
          assignments[draft.id] ??
          pending.current.get(draft.id)?.state.assignment ??
          readScooterImportSnapshot(draft.state)?.assignment,
      });
      const signature = scooterImportStateSignature(state);
      const item = pending.current.get(draft.id);
      if (item?.signature === signature) {
        if (item.resume) {
          item.resume = false;
          queueMicrotask(() => {
            void persist(item);
          });
        }
        return;
      }
      const next: PendingSave = item ?? {
        draft,
        state,
        signature,
        savedSignature: scooterImportStateSignature(draft.state),
        running: false,
        blocked: false,
      };
      next.state = state;
      next.signature = signature;
      pending.current.set(draft.id, next);
      writeScooterImportBackup(draft.id, {
        owner: workspaceOwner,
        revision: next.draft.revision,
        state,
        signature,
        sentSignature: next.sentSignature,
      });
      setDrafts((items) =>
        items.map((entry) =>
          entry.draft.id === draft.id &&
          (entry.status !== state.status || entry.identity !== identity)
            ? { ...entry, status: state.status, identity }
            : entry,
        ),
      );
      // Queueing a microtask coalesces one React commit while still saving jobs promptly.
      queueMicrotask(() => {
        void persist(next);
      });
    },
    [persist, workspaceOwner, assignments],
  );

  useEffect(() => {
    const retry = () => {
      for (const item of pending.current.values()) void persist(item);
    };
    window.addEventListener("online", retry);
    window.addEventListener("pagehide", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("pagehide", retry);
    };
  }, [persist]);

  async function retrySaves() {
    if (savingRecovery || recoveryBlocked) return;
    setSavingRecovery(true);
    try {
      await Promise.all(
        [...pending.current.values()].map((item) => persist(item)),
      );
    } finally {
      setSavingRecovery(false);
    }
  }

  async function discard(id: string) {
    setDiscarding(id);
    setShowRecovery(false);
    setError(undefined);
    try {
      closed.current.add(id);
      await webApi.fetch(
        v1.scooters.ROUTES.importDrafts.discard(id),
        v1.scooters.discardScooterDocumentEditorSessionSchema,
        { method: "POST" },
      );
      pending.current.delete(id);
      clearScooterImportBackup(id);
      setDrafts((items) => items.filter((entry) => entry.draft.id !== id));
      setSelectedId((selected) =>
        selected === id
          ? drafts.find((entry) => entry.draft.id !== id)?.draft.id
          : selected,
      );
    } catch {
      closed.current.delete(id);
      setError(t("discardFailed"));
    } finally {
      setDiscarding(undefined);
    }
  }

  function complete(
    id: string,
    scooter: v1.scooters.Scooter,
    reviewNext: boolean,
  ) {
    closed.current.add(id);
    pending.current.delete(id);
    clearScooterImportBackup(id);
    setCreated((items) => [scooter, ...items]);
    setDrafts((items) => items.filter((entry) => entry.draft.id !== id));
    const next =
      drafts.find(
        (entry) =>
          entry.draft.id !== id && ["review", "ready"].includes(entry.status),
      ) ?? drafts.find((entry) => entry.draft.id !== id);
    setSelectedId(next?.draft.id);
    if (reviewNext && !next) void add();
  }

  useEffect(() => {
    if (grouping.current || loading) return;
    const complete = drafts.flatMap((entry) => {
      const item = pending.current.get(entry.draft.id);
      const state = item?.state ?? entry.initialSnapshot;
      if (
        !state ||
        item?.blocked ||
        !["review", "ready"].includes(entry.status) ||
        state.photos?.photos.length ||
        state.photos?.uploads.length
      )
        return [];
      const vin = scooterImportIdentity(state);
      return [{ entry, state, vin, item }];
    });
    const target = complete.find((candidate, index) =>
      complete.some(
        (other, otherIndex) =>
          (otherIndex > index && candidate.vin && other.vin === candidate.vin) ||
          (assignments[other.entry.draft.id] ?? other.state.assignment) === candidate.entry.draft.id,
      ),
    );
    const source =
      target &&
      complete.find(
        (candidate) =>
          candidate.entry.draft.id !== target.entry.draft.id &&
          ((target.vin && candidate.vin === target.vin) ||
            (assignments[candidate.entry.draft.id] ?? candidate.state.assignment) === target.entry.draft.id),
      );
    if (!target || !source) return;
    const pair = `${target.entry.draft.id}:${source.entry.draft.id}`;
    if (failedGroups.current.has(pair)) return;
    const combined = mergeScooterImportSnapshots(target.state, source.state);
    if (
      combined.documents.drafts.length >
        v1.scooters.SCOOTER_DOCUMENT_MAX_FILES ||
      scooterImportHasManualValues(source.state)
    ) {
      failedGroups.current.add(pair);
      setError(t("groupingNeedsReview"));
      return;
    }
    grouping.current = true;
    const ids = [target.entry.draft.id, source.entry.draft.id];
    setMerging(ids);
    ids.forEach((id) => closed.current.add(id));
    void (async () => {
      try {
        // Let any already-sent autosave update the revision before the atomic move.
        while (target.item?.running || source.item?.running)
          await new Promise((resolve) => setTimeout(resolve, 50));
        const result = await webApi
          .fetch(
            v1.scooters.ROUTES.importDrafts.merge(target.entry.draft.id),
            v1.scooters.scooterImportDraftSchema,
            {
              method: "POST",
              json: {
                sourceId: source.entry.draft.id,
                sourceRevision: (source.item?.draft ?? source.entry.draft)
                  .revision,
                revision: (target.item?.draft ?? target.entry.draft).revision,
                state: compactScooterImportSnapshot(combined),
              },
            },
          )
          .catch(async (cause: unknown) => {
            // The merge can commit before its response is lost. Recover the saved
            // destination rather than restoring a stale, pre-grouping backup.
            const current = await webApi.fetch(
              v1.scooters.ROUTES.importDrafts.get(target.entry.draft.id),
              v1.scooters.scooterImportDraftSchema,
              { cache: "no-store" },
            );
            if (
              scooterImportStateSignature(current.state) !==
              scooterImportStateSignature(
                compactScooterImportSnapshot(combined),
              )
            )
              throw cause;
            return current;
          });
        if (!mounted.current) return;
        ids.forEach((id) => {
          pending.current.delete(id);
          clearScooterImportBackup(id);
        });
        closed.current.delete(target.entry.draft.id);
        setDrafts((items) =>
          items
            .filter((entry) => entry.draft.id !== source.entry.draft.id)
            .map((entry) =>
              entry.draft.id === target.entry.draft.id
                ? {
                    ...entry,
                    draft: result,
                    initialSnapshot: readScooterImportSnapshot(result.state),
                    incomingFiles: undefined,
                    generation: (entry.generation ?? 0) + 1,
                    identity: scooterImportIdentity(combined),
                    status: "review",
                  }
                : entry,
            ),
        );
        setSelectedId(target.entry.draft.id);
      } catch {
        ids.forEach((id) => closed.current.delete(id));
        failedGroups.current.add(pair);
        for (const id of ids) {
          const item = pending.current.get(id);
          if (item) void persist(item);
        }
        if (mounted.current) setError(t("groupingFailed"));
      } finally {
        grouping.current = false;
        if (mounted.current) setMerging([]);
      }
    })();
  }, [drafts, loading, t, persist, assignments]);

  function uploadFiles(files: File[]) {
    if (loading || adding || uploadBatchRunning.current || !files.length)
      return;
    if (
      files.some(
        (file) =>
          !v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES.includes(
            file.type as (typeof v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES)[number],
          ) ||
          !file.size ||
          file.size > v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES ||
          !v1.scooters.scooterDocumentDraftSchema.shape.fileName.safeParse(
            file.name,
          ).success,
      ) ||
      files.length > v1.scooters.SCOOTER_DOCUMENT_MAX_FILES
    ) {
      setError(t("invalidUpload"));
      return;
    }
    const groups = files.map((file) => [file]);
    const emptyDraft = drafts.find(
      (entry) =>
        entry.status === "empty" &&
        !entry.incomingFiles &&
        !pending.current.get(entry.draft.id)?.state.documents.drafts.length,
    );
    if (
      drafts.length + groups.length - (emptyDraft ? 1 : 0) >
      v1.scooters.SCOOTER_IMPORT_MAX_DRAFTS
    ) {
      setError(t("limitReached"));
      return;
    }
    if (groups.length > 1) {
      uploadBatchRunning.current = true;
      void (async () => {
        try {
          for (const [index, group] of groups.entries()) {
            if (index === 0 && emptyDraft)
              setDrafts((items) =>
                items.map((entry) =>
                  entry.draft.id === emptyDraft.draft.id
                    ? {
                        ...entry,
                        incomingFiles: {
                          id: crypto.randomUUID(),
                          files: group,
                        },
                        status: "uploading",
                      }
                    : entry,
                ),
              );
            else await add(group);
          }
        } finally {
          uploadBatchRunning.current = false;
        }
      })();
      return;
    }
    const target = emptyDraft;
    if (target) {
      const count =
        pending.current.get(target.draft.id)?.state.documents.drafts.length ??
        target.initialSnapshot?.documents.drafts.length ??
        0;
      if (count + files.length > v1.scooters.SCOOTER_DOCUMENT_MAX_FILES) {
        setError(t("invalidUpload"));
        return;
      }
      setDrafts((items) =>
        items.map((entry) =>
          entry.draft.id === target.draft.id
            ? {
                ...entry,
                incomingFiles: { id: crypto.randomUUID(), files },
                status: "uploading",
              }
            : entry,
        ),
      );
      setSelectedId(target.draft.id);
    } else if (drafts.length < v1.scooters.SCOOTER_IMPORT_MAX_DRAFTS)
      void add(files);
    else setError(t("limitReached"));
  }

  function needsAssignment(id: string, status: ScooterImportStatus) {
    const entry = drafts.find((candidate) => candidate.draft.id === id);
    const state = pending.current.get(id)?.state ?? entry?.initialSnapshot;
    return Boolean(
      state?.documents.drafts.length &&
      ["review", "ready", "attention"].includes(status) &&
      !scooterImportIdentity(state) &&
      (assignments[id] ?? state.assignment) !== "new",
    );
  }

  function assign(id: string, value: string | null) {
    if (!value) return;
    failedGroups.current.clear();
    setAssignments((current) => ({ ...current, [id]: value }));
    const entry = drafts.find((candidate) => candidate.draft.id === id);
    const state = pending.current.get(id)?.state ?? entry?.initialSnapshot;
    if (entry && state) snapshot(entry.draft, { ...state, assignment: value });
  }

  return (
    <PageLayout>
      <div className="grid min-w-0 gap-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("description", { max: v1.scooters.SCOOTER_IMPORT_MAX_DRAFTS })}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={scootersHref}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("back")}
            </Link>
            <Button
              type="button"
              onClick={() => {
                void add();
              }}
              disabled={
                loading ||
                adding ||
                drafts.length >= v1.scooters.SCOOTER_IMPORT_MAX_DRAFTS
              }
            >
              {adding ? <Spinner /> : null}
              {t("addAnother")}
            </Button>
          </div>
        </div>
        <div className="grid gap-3">
          <FileDropZone
            label={t("uploadDocuments")}
            browseLabel={t("browse")}
            hint={t("uploadHint")}
            accept={v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES.join(",")}
            disabled={loading || adding}
            onFiles={uploadFiles}
          />
        </div>
        {error ? (
          <div role="alert" className="grid gap-2 text-sm text-destructive">
            <p>{error}</p>
            {showRecovery ? (
              <SaveButton
                type="button"
                variant="outline"
                disabled={recoveryBlocked}
                state={savingRecovery ? "pending" : "error"}
                idleLabel={t("saveDrafts")}
                pendingLabel={t("savingDrafts")}
                successLabel={t("savedDrafts")}
                onClick={() => {
                  void retrySaves();
                }}
              />
            ) : null}
          </div>
        ) : null}
        {loading ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner />
            {t("loading")}
          </p>
        ) : null}
        {created.length ? (
          <ul className="grid gap-2">
            {created.map((scooter) => (
              <li key={scooter.id} className="text-sm">
                <Link
                  href={`${scootersHref}/${encodeURIComponent(scooter.id)}`}
                  className="font-medium underline underline-offset-4"
                >
                  {v1.scooters.scooterDisplayCode(scooter)}
                </Link>{" "}
                · {t("status.created")}
              </li>
            ))}
          </ul>
        ) : null}
        {drafts.length ? (
          <HorizontalScrollArea
            label={t("drafts")}
            fadeEdges
            className="-mx-(--page-gutter) w-auto md:mx-0 md:w-full"
          >
            <nav
              aria-label={t("drafts")}
              className="flex w-max min-w-full gap-2 px-(--page-gutter) py-2 md:w-auto md:flex-wrap md:px-0"
            >
              {drafts.map(({ draft, status }, index) => (
                <Button
                  key={draft.id}
                  type="button"
                  variant="outline"
                  aria-pressed={selectedId === draft.id}
                  onClick={() => {
                    setSelectedId(draft.id);
                    document
                      .getElementById(`scooter-draft-${draft.id}`)
                      ?.scrollIntoView?.({ block: "start" });
                  }}
                  className={`h-auto min-h-12 flex-nowrap gap-2 py-3 whitespace-nowrap aria-pressed:border-current aria-pressed:ring-2 aria-pressed:ring-current aria-pressed:ring-inset ${draftStatusColors[status]}`}
                >
                  <span>{t("draft", { number: index + 1 })}</span>
                  <span className="text-xs font-medium">
                    {t(`status.${status}`)}
                  </span>
                </Button>
              ))}
            </nav>
          </HorizontalScrollArea>
        ) : null}
        {drafts.map(
          (
            {
              draft,
              initialSnapshot,
              restoreFailed,
              incomingFiles,
              status,
              generation,
            },
            index,
          ) => (
            <fieldset
              disabled={merging.includes(draft.id)}
              key={`${draft.id}:${generation ?? 0}`}
              id={`scooter-draft-${draft.id}`}
              className="grid min-w-0 gap-4 border-t border-border pt-6 scroll-mt-8"
              aria-label={t("draft", { number: index + 1 })}
            >
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div className="grid gap-2">
                  <h2 className="text-xl font-semibold">
                    {t("draft", { number: index + 1 })}
                  </h2>
                  <Badge variant="outline">{t(`status.${status}`)}</Badge>
                  <p className="text-sm text-muted-foreground">
                    {t("pdfHint")}
                  </p>
                </div>
                {["review", "ready", "attention"].includes(status) ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSelectedId(draft.id);
                      document
                        .getElementById(`scooter-draft-${draft.id}`)
                        ?.querySelector<HTMLInputElement>('input[name="vin"]')
                        ?.focus();
                    }}
                  >
                    {t("review")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={discarding === draft.id}
                  onClick={() => {
                    void discard(draft.id);
                  }}
                >
                  {t("discard")}
                </Button>
              </div>
              {needsAssignment(draft.id, status) ? (
                <div className="grid gap-2">
                  <Label htmlFor={`assign-${draft.id}`}>
                    {t("assignmentNeeded")}
                  </Label>
                  <Select
                    value={assignments[draft.id] ?? ""}
                    onValueChange={(value) => assign(draft.id, value)}
                  >
                    <SelectTrigger
                      id={`assign-${draft.id}`}
                      aria-label={t("assignmentNeeded")}
                    >
                      <SelectValue placeholder={t("chooseScooter")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">{t("newScooter")}</SelectItem>
                      {drafts
                        .filter((entry) => entry.draft.id !== draft.id)
                        .map((entry) => (
                          <SelectItem
                            key={entry.draft.id}
                            value={entry.draft.id}
                          >
                            {t("draft", { number: drafts.indexOf(entry) + 1 })}
                            {entry.identity ? ` · ${entry.identity}` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {restoreFailed ? (
                <p role="alert" className="text-sm text-destructive">
                  {t("restoreFailed")}
                </p>
              ) : (
                <ScooterEditor
                  incomingFiles={incomingFiles}
                  persistenceBlocked={
                    revisionConflicts.includes(draft.id) ||
                    needsAssignment(draft.id, status)
                  }
                  embedded
                  importDraft={draft}
                  initialSnapshot={initialSnapshot}
                  onSnapshot={(state) => snapshot(draft, state)}
                  onCreated={(scooter, reviewNext) =>
                    complete(draft.id, scooter, reviewNext)
                  }
                  brands={brands}
                  vocabulary={vocabulary}
                  returnHref={scootersHref}
                />
              )}
            </fieldset>
          ),
        )}
        {!loading && !drafts.length ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : null}
      </div>
    </PageLayout>
  );
}

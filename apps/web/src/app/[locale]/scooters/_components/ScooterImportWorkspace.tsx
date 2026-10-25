"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  Spinner,
  HorizontalScrollArea,
} from "@repo/ui/components";
import { SaveButton } from "@repo/ui/components/save-button";
import { WizardExitDialog } from "@repo/ui/components/wizard-exit-dialog";
import { PageHeaderActions } from "@/components/PageHeaderActions";
import { PageLayout } from "@repo/ui/components/page-layout";
import { motion, radius } from "@repo/theme";
import { PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { webApi } from "@/lib/api";
import { useWorkspaceNotifications } from "@/components/WorkspaceNotifications";
import { ScooterFleetNumberRefreshContext } from "./ScooterFleetNumberRefreshContext";
import type { CivVocabulary } from "./CivVocabularyContext";
import {
  readScooterImportBackup,
  writeScooterImportBackup,
  clearScooterImportBackup,
} from "./scooter-import-backup";
import { ScooterEditor } from "./ScooterEditor";
import {
  compactScooterImportSnapshot,
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
  documentCount: number;
  status: ScooterImportStatus;
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
  const feedback = useTranslations("scooters.feedback");
  const notifications = useWorkspaceNotifications();
  const [fleetNumberRevision, setFleetNumberRevision] = useState(0);
  const [workspaceOwner] = useState(() => crypto.randomUUID());
  const [drafts, setDrafts] = useState<WorkspaceDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [discarding, setDiscarding] = useState<string>();
  const [discardTarget, setDiscardTarget] = useState<string>();
  const [discardError, setDiscardError] = useState<string>();
  const [error, setError] = useState<string>();
  const [savingRecovery, setSavingRecovery] = useState(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [revisionConflicts, setRevisionConflicts] = useState<string[]>([]);
  const [created, setCreated] = useState<v1.scooters.Scooter[]>([]);
  const pending = useRef(new Map<string, PendingSave>());
  const closed = useRef(new Set<string>());
  const mounted = useRef(true);

  const add = useCallback(async () => {
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
          documentCount: 0,
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
  }, [t]);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const selectionBounds = useRef(
    new Map<string, { bounds: DOMRect; borderRadius: number }>(),
  );
  const selectionAnimations = useRef<Animation[]>([]);

  function selectDraft(id: string) {
    if (id === selectedId) return;
    // Capture the badge positions before the selected badge becomes the heading.
    selectionBounds.current.clear();
    workspaceRef.current
      ?.querySelectorAll<HTMLElement>("[data-draft-motion]")
      .forEach((node) => {
        if (!node.closest("[hidden]")) {
          const bounds = node.getBoundingClientRect();
          selectionBounds.current.set(node.dataset.draftMotion!, {
            bounds,
            // Use the rendered pill radius so it interpolates throughout the move.
            borderRadius: node.matches("button")
              ? Math.min(bounds.width, bounds.height) / 2
              : radius.lg,
          });
        }
      });
    setSelectedId(id);
  }

  useLayoutEffect(() => {
    selectionAnimations.current.forEach((animation) => animation.cancel());
    selectionAnimations.current = [];
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      workspaceRef.current
        ?.querySelectorAll<HTMLElement>("[data-draft-motion]")
        .forEach((node) => {
          if (node.closest("[hidden]") || !node.animate) return;
          const before = selectionBounds.current.get(node.dataset.draftMotion!);
          if (!before) return;
          const after = node.getBoundingClientRect();
          selectionAnimations.current.push(
            node.animate(
              [
                {
                  transform: `translate(${before.bounds.left - after.left}px, ${before.bounds.top - after.top}px)`,
                  borderRadius: `${before.borderRadius}px`,
                },
                {
                  transform: "none",
                  borderRadius: `${node.matches("button") ? Math.min(after.width, after.height) / 2 : radius.lg}px`,
                },
              ],
              {
                duration: motion.duration.normal,
                easing: motion.easing.decelerate,
              },
            ),
          );
        });
    }
    selectionBounds.current.clear();
    workspaceRef.current
      ?.querySelector<HTMLElement>("[data-selected-draft-title]")
      ?.focus({ preventScroll: true });
  }, [selectedId]);

  useEffect(
    () => () => {
      selectionAnimations.current.forEach((animation) => animation.cancel());
    },
    [],
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
                initialSnapshot,
                documentCount:
                  initialSnapshot?.documents.drafts.filter(
                    (document) => document.status === "ready",
                  ).length ?? 0,
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
      state = compactScooterImportSnapshot(state);
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
      const documentCount = state.documents.drafts.filter(
        (document) => document.status === "ready",
      ).length;
      setDrafts((items) =>
        items.map((entry) =>
          entry.draft.id === draft.id &&
          (entry.status !== state.status ||
            entry.documentCount !== documentCount)
            ? {
                ...entry,
                status: state.status,
                documentCount,
              }
            : entry,
        ),
      );
      // Queueing a microtask coalesces one React commit while still saving jobs promptly.
      queueMicrotask(() => {
        void persist(next);
      });
    },
    [persist, workspaceOwner],
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
    if (discarding) return;
    setDiscarding(id);
    setDiscardError(undefined);
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
      setDiscardTarget(undefined);
    } catch {
      closed.current.delete(id);
      setDiscardError(t("discardFailed"));
      setError(t("discardFailed"));
    } finally {
      setDiscarding(undefined);
    }
  }

  function complete(id: string, scooter: v1.scooters.Scooter) {
    if (closed.current.has(id)) return;
    closed.current.add(id);
    notifications?.add({
      title: feedback("createSuccessTitle"),
      description: v1.scooters.scooterDisplayCode(scooter),
      variant: "success",
    });
    setFleetNumberRevision((revision) => revision + 1);
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
  }

  const multipleDrafts = drafts.length > 1;
  const canAddDraft =
    !loading && drafts.every((entry) => entry.documentCount > 0);

  return (
    <PageLayout>
      <ScooterFleetNumberRefreshContext value={fleetNumberRevision}>
        <div ref={workspaceRef} className="grid min-w-0 gap-6">
          {multipleDrafts || canAddDraft ? (
            <HorizontalScrollArea
              key={multipleDrafts ? "drafts" : "add"}
              label={t("drafts")}
              fadeEdges
              scrollbarVisibility="desktop"
              className={`-mx-(--page-gutter) w-auto md:mx-0 md:w-full animate-in fade-in-0 slide-in-from-top-2 duration-normal ease-decelerate motion-reduce:animate-none ${multipleDrafts ? "" : "hidden md:block"}`}
            >
              <nav
                aria-label={t("drafts")}
                className="flex w-max min-w-full items-center gap-2 px-(--page-gutter) py-2 md:px-0"
              >
                {drafts.map(({ draft, status }, index) =>
                  selectedId !== draft.id ? (
                    <Button
                      key={draft.id}
                      data-draft-motion={draft.id}
                      type="button"
                      variant="outline"
                      aria-controls={`scooter-draft-${draft.id}`}
                      aria-expanded={false}
                      onClick={() => selectDraft(draft.id)}
                      className={`h-auto min-h-12 rounded-full flex-nowrap gap-2 py-3 whitespace-nowrap ${draftStatusColors[status]}`}
                    >
                      <span>{t("draft", { number: index + 1 })}</span>
                      <span className="text-xs font-medium">
                        {t(`status.${status}`)}
                      </span>
                    </Button>
                  ) : null,
                )}
                {canAddDraft ? (
                  <PageHeaderActions>
                    <Button
                      data-draft-motion="add"
                      type="button"
                      variant="outline"
                      className="size-11 shrink-0 rounded-full p-0 whitespace-nowrap animate-in fade-in-0 zoom-in-95 duration-normal ease-decelerate motion-reduce:animate-none md:h-auto md:min-h-12 md:w-auto md:px-4"
                      aria-label={t("addParallel")}
                      title={t("addParallel")}
                      disabled={
                        loading ||
                        adding ||
                        drafts.length >= v1.scooters.SCOOTER_IMPORT_MAX_DRAFTS
                      }
                      onClick={() => {
                        void add();
                      }}
                    >
                      {adding ? <Spinner /> : <PlusIcon aria-hidden="true" />}
                      <span className="sr-only md:not-sr-only">
                        {t("addParallel")}
                      </span>
                    </Button>
                  </PageHeaderActions>
                ) : null}
              </nav>
            </HorizontalScrollArea>
          ) : null}
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
          {drafts.map(
            ({ draft, initialSnapshot, restoreFailed, status }, index) => (
              <fieldset
                key={draft.id}
                id={`scooter-draft-${draft.id}`}
                hidden={selectedId !== draft.id}
                className={
                  selectedId === draft.id ? "grid min-w-0 gap-4" : "hidden"
                }
                aria-label={t("draft", { number: index + 1 })}
              >
                {multipleDrafts ? (
                  <div className="flex min-w-0 items-center justify-between gap-3 animate-in fade-in-0 slide-in-from-top-2 duration-normal ease-decelerate motion-reduce:animate-none">
                    <h2
                      tabIndex={-1}
                      data-selected-draft-title={
                        selectedId === draft.id ? "" : undefined
                      }
                      className="min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Badge
                        data-draft-motion={draft.id}
                        variant="outline"
                        className={`min-h-12 gap-2 rounded-lg px-4 py-3 text-sm font-semibold ${draftStatusColors[status]}`}
                      >
                        <span>{t("draft", { number: index + 1 })}</span>
                        <span className="text-xs font-medium">
                          {t(`status.${status}`)}
                        </span>
                      </Badge>
                    </h2>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("discard")}
                      title={t("discard")}
                      disabled={discarding === draft.id}
                      onClick={() => {
                        setDiscardError(undefined);
                        setDiscardTarget(draft.id);
                      }}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
                {restoreFailed ? (
                  <p role="alert" className="text-sm text-destructive">
                    {t("restoreFailed")}
                  </p>
                ) : (
                  <ScooterEditor
                    persistenceBlocked={revisionConflicts.includes(draft.id)}
                    draftActions={{
                      hasOtherDrafts: drafts.length > 1,
                      pending: discarding === draft.id,
                      onDiscard: () => {
                        setDiscardError(undefined);
                        setDiscardTarget(draft.id);
                      },
                    }}
                    embedded
                    importDraft={draft}
                    initialSnapshot={initialSnapshot}
                    onSnapshot={(state) => snapshot(draft, state)}
                    onCreated={(scooter) => complete(draft.id, scooter)}
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
      </ScooterFleetNumberRefreshContext>
      <WizardExitDialog
        open={Boolean(discardTarget)}
        onOpenChange={(open) => {
          if (!open && !discarding) {
            setDiscardTarget(undefined);
            setDiscardError(undefined);
          }
        }}
        title={t("discardTitle")}
        description={t("discardDescription")}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(discarding)}
              onClick={() => {
                setDiscardTarget(undefined);
                setDiscardError(undefined);
              }}
            >
              {t("keepDraft")}
            </Button>
            <SaveButton
              type="button"
              variant="destructive"
              disabled={Boolean(discarding)}
              state={discarding ? "pending" : discardError ? "error" : "idle"}
              idleLabel={t("discard")}
              pendingLabel={t("discarding")}
              successLabel={t("discarded")}
              onClick={() => {
                if (discardTarget) void discard(discardTarget);
              }}
            />
          </>
        }
      >
        {discardError ? (
          <p role="alert" className="text-sm text-destructive">
            {discardError}
          </p>
        ) : null}
      </WizardExitDialog>
    </PageLayout>
  );
}

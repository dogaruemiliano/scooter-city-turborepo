"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { v1 } from "@repo/api-shared";
import { breakpoints, motion, spacing, viewportSizing } from "@repo/theme";
import {
  DocumentStatus,
  type DocumentStatusState,
} from "@repo/ui/components/document-status";
import { DocumentPreview } from "@repo/ui/components/document-preview";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  FileDropZone,
  HorizontalScrollArea,
} from "@repo/ui/components";
import { useObjectUrl } from "@repo/ui/hooks/use-object-url";
import { SparklesIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  ScooterDocumentTypeEditor,
  type LogicalDocumentUpdate,
} from "./ScooterDocumentTypeEditor";
import type { DocumentImportResult } from "./scooter-document-import";
import { SavedDocumentCard } from "./SavedDocumentCard";
import { ScooterClientCopyBadge } from "./ScooterClientCopyBadge";
import { ScooterDocumentAnalysisContext } from "./ScooterDocumentAnalysisStatus";
import type {
  DocumentDraft,
  ScooterDocumentsEditor,
} from "./useScooterDocuments";

export function ScooterBatchDocuments({
  documents,
  disabled: formDisabled,
  analyzing,
  onRetryAnalysis,
  onCancelAnalysis,
  children,
  headerActions,
  onLogicalDocument,
  scooterVin,
}: {
  documents: ScooterDocumentsEditor;
  disabled: boolean;
  analyzing: boolean;
  onRetryAnalysis?: (sourceId: string) => void;
  onCancelAnalysis?: () => void;
  children?: ReactNode;
  headerActions?: ReactNode;
  importResult?: Extract<DocumentImportResult, { ok: true }>;
  onLogicalDocument?: LogicalDocumentUpdate;
  scooterVin?: string;
}) {
  const t = useTranslations("scooters.documents");
  const user = useOptionalSession()?.user;
  const canWrite = canAccess(user, "scooter_documents.write");
  const canRead = canAccess(user, "scooter_documents.read");
  const disabled = formDisabled || !canWrite;
  const canExtract = canAccess(user, "scooter_documents.extract");
  const creation = useTranslations("scooters.creation");
  const extraction = useTranslations("scooters.extraction");
  const [initialDraftIds] = useState(
    () => new Set(documents.drafts.map((draft) => draft.id)),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const analysisEntries = useContext(ScooterDocumentAnalysisContext);
  const hasDocuments = documents.existing.length + documents.drafts.length > 0;

  const documentList = useRef<HTMLUListElement>(null);
  const previousDraftIds = useRef(
    new Set(documents.drafts.map((draft) => draft.id)),
  );
  useEffect(() => {
    const added = documents.drafts.some(
      (draft) => !previousDraftIds.current.has(draft.id),
    );
    previousDraftIds.current = new Set(
      documents.drafts.map((draft) => draft.id),
    );
    if (!added || window.innerWidth >= breakpoints.md) return;
    const viewport = documentList.current?.closest<HTMLElement>(
      '[data-slot="horizontal-scroll-viewport"]',
    );
    if (!viewport) return;
    viewport.scrollTo?.({
      left: Math.max(0, viewport.scrollWidth - viewport.clientWidth),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [documents.drafts]);

  if (!canRead) return null;

  function add(files: File[]) {
    if (disabled) return;
    const available =
      v1.scooters.SCOOTER_DOCUMENT_MAX_FILES -
      documents.drafts.length -
      documents.existing.length;
    const accepted: File[] = [];
    const problems: string[] = [];
    for (const file of files) {
      const error = !(
        v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES as readonly string[]
      ).includes(file.type)
        ? t("unsupportedFormat")
        : !file.size
          ? t("emptyFile")
          : file.size > v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES
            ? t("tooLarge")
            : !v1.scooters.scooterDocumentDraftSchema.shape.fileName.safeParse(
                  file.name,
                ).success
              ? t("invalidName")
              : documents.drafts.some(
                    (draft) =>
                      draft.file.name === file.name &&
                      draft.file.size === file.size &&
                      draft.file.lastModified === file.lastModified,
                  ) ||
                  accepted.some(
                    (other) =>
                      other.name === file.name &&
                      other.size === file.size &&
                      other.lastModified === file.lastModified,
                  )
                ? t("batch.duplicate")
                : accepted.length >= available
                  ? t("tooMany")
                  : null;
      if (error) problems.push(`${file.name}: ${error}`);
      else accepted.push(file);
    }
    setErrors(problems);
    if (accepted.length) documents.add(null, accepted);
  }

  return (
    <Card as="section" aria-label={t("title")}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex min-w-0 items-center gap-2 [&_svg]:shrink-0">
            <SparklesIcon aria-hidden="true" className="size-5" />
            {creation("automaticFill")}
          </CardTitle>
          <div className="flex shrink-0 items-center gap-2">
            {canExtract ? (
              <Badge variant="outline">{creation("aiPowered")}</Badge>
            ) : null}
            {headerActions}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <FileDropZone
          label={t("batch.drop")}
          mobileLabel={t("batch.select")}
          browseLabel={t("batch.browse")}
          addLabel={t("batch.addDocument")}
          hint={t("batch.hint")}
          requirements={t("batch.requirements")}
          accept={v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES.join(",")}
          disabled={disabled}
          onFiles={add}
        >
          {hasDocuments
            ? (addCard) => (
                <div className="grid min-w-0 gap-4">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p
                      className="text-sm text-muted-foreground"
                      aria-live="polite"
                    >
                      {t("documentCount", {
                        count: documents.existing.reduce(
                          (count, document) =>
                            count + (document.clientCopy ? 2 : 1),
                          documents.drafts.length,
                        ),
                      })}
                    </p>
                    {analyzing && onCancelAnalysis ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        onClick={onCancelAnalysis}
                      >
                        {extraction("cancel")}
                      </Button>
                    ) : null}
                  </div>
                  <HorizontalScrollArea
                    label={t("batch.attached")}
                    fadeEdges="always"
                    className="-mx-(--card-spacing) w-auto [--gallery-fade-width:var(--card-spacing)] md:mx-0 md:w-full md:[--gallery-fade-width:0]"
                    fadeWidth="var(--gallery-fade-width)"
                    contentWidth="viewport"
                    snap
                    scrollbarVisibility="desktop"
                  >
                    <ul
                      ref={documentList}
                      aria-label={t("batch.attached")}
                      style={
                        {
                          "--document-card-width":
                            viewportSizing.scooterDocumentCard,
                          "--document-card-max-width":
                            viewportSizing.scooterDocumentCardMax,
                          "--document-grid-columns":
                            viewportSizing.scooterDocumentGrid,
                        } as CSSProperties
                      }
                      className="grid w-full min-w-0 grid-flow-col auto-cols-(--document-card-width) gap-3 px-(--card-spacing) md:px-0 [&>li]:snap-start [&>li:last-child]:relative [&>li:last-child]:after:absolute [&>li:last-child]:after:left-full [&>li:last-child]:after:top-0 [&>li:last-child]:after:h-px [&>li:last-child]:after:w-(--card-spacing) [&>li:last-child]:after:content-[''] md:[&>li:last-child]:after:content-none has-[>li:only-child]:auto-cols-[100%] md:grid-flow-row md:auto-cols-auto md:grid-cols-(--document-grid-columns) md:[&>li]:max-w-(--document-card-max-width)"
                    >
                      {documents.existing.flatMap((document) => [
                        <SavedDocumentCard
                          key={document.id}
                          document={document}
                          disabled={disabled}
                          onRemove={() => documents.removeExisting(document.id)}
                          onLogicalDocument={
                            analysisEntries[document.id]?.status === "success"
                              ? onLogicalDocument
                              : undefined
                          }
                          scooterVin={scooterVin}
                        />,
                        ...(document.clientCopy
                          ? [
                              <SavedDocumentCard
                                key={`${document.id}-copy`}
                                document={document}
                                clientCopy
                                disabled={disabled}
                                onRemove={() =>
                                  documents.removeExisting(document.id)
                                }
                              />,
                            ]
                          : []),
                      ])}
                      {documents.drafts.map((draft) => (
                        <BatchDocumentRow
                          key={draft.id}
                          draft={draft}
                          animateEntrance={!initialDraftIds.has(draft.id)}
                          documents={documents}
                          disabled={disabled}
                          canExtract={canExtract}
                          onLogicalDocument={onLogicalDocument}
                          scooterVin={scooterVin}
                          onPreview={() => documents.preview(draft)}
                          onType={(type) =>
                            documents.classify(draft.id, type, true)
                          }
                          onRemove={() => documents.removeDraft(draft.id)}
                          onRetry={() =>
                            draft.status === "failed"
                              ? documents.retry(draft)
                              : onRetryAnalysis?.(draft.id)
                          }
                        />
                      ))}
                      {addCard ? <li className="min-w-0">{addCard}</li> : null}
                    </ul>
                  </HorizontalScrollArea>
                </div>
              )
            : undefined}
        </FileDropZone>
        {!canExtract ? (
          <p className="text-sm text-muted-foreground">
            {t("batch.manualTypes")}
          </p>
        ) : null}
        {errors.length ? (
          <ul role="alert" className="grid gap-1 text-sm text-destructive">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
      {(documents.removed ?? []).length ? (
        <CardContent className="grid gap-2">
          {documents.removed.map((document) => (
            <div
              key={document.id}
              className="flex min-w-0 items-center justify-between gap-3"
            >
              <span className="truncate text-sm text-muted-foreground">
                {document.fileName}
              </span>
              <Button
                type="button"
                variant="text"
                disabled={disabled}
                onClick={() => documents.undoRemove(document.id)}
              >
                {t("undo")}
              </Button>
            </div>
          ))}
        </CardContent>
      ) : null}
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}

function BatchDocumentRow({
  draft,
  animateEntrance,
  documents,
  disabled,
  canExtract,
  onType,
  onRemove,
  onRetry,
  onPreview,
  onLogicalDocument,
  scooterVin,
}: {
  draft: DocumentDraft;
  animateEntrance: boolean;
  documents: ScooterDocumentsEditor;
  disabled: boolean;
  canExtract: boolean;
  onType: (type: v1.scooters.ScooterDocumentType) => void;
  onRemove: () => void;
  onRetry: () => void;
  onPreview: () => Promise<File>;
  onLogicalDocument?: LogicalDocumentUpdate;
  scooterVin?: string;
}) {
  const t = useTranslations("scooters.documents");
  const extractionT = useTranslations("scooters.extraction");
  const workspace = useTranslations("scooters.workspace");
  const state = useContext(ScooterDocumentAnalysisContext)[draft.id];
  const src = useObjectUrl(draft.fileUnavailable ? null : draft.file);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const cardRef = useRef<HTMLLIElement>(null);
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (
      !animateEntrance ||
      !card?.animate ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const animation = card.animate(
      [
        { opacity: 0, transform: `translateY(${spacing[2]}px)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: motion.duration.normal, easing: motion.easing.decelerate },
    );
    return () => animation.cancel();
  }, [animateEntrance]);
  const previewRequest = useRef<Promise<File> | null>(null);
  const attemptedPreview = useRef<string | undefined>(undefined);
  const loadPreview = useCallback(() => {
    if (previewRequest.current) return previewRequest.current;
    setPreviewError(false);
    setPreviewLoading(true);
    const request = Promise.resolve()
      .then(onPreview)
      .catch((error) => {
        setPreviewError(true);
        throw error;
      })
      .finally(() => {
        previewRequest.current = null;
        setPreviewLoading(false);
      });
    previewRequest.current = request;
    return request;
  }, [onPreview]);

  useEffect(() => {
    const card = cardRef.current;
    if (
      !card ||
      !draft.fileUnavailable ||
      !draft.uploadToken ||
      draft.status !== "ready" ||
      attemptedPreview.current === draft.uploadToken ||
      !("IntersectionObserver" in window)
    )
      return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      attemptedPreview.current = draft.uploadToken;
      void loadPreview().catch(() => {
        /* The card shows the error; clicking retries. */
      });
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, [draft.fileUnavailable, draft.uploadToken, draft.status, loadPreview]);

  async function openPreview() {
    if (!draft.fileUnavailable) {
      setOpen(true);
      return;
    }
    try {
      await loadPreview();
      setOpen(true);
    } catch {
      /* Keep the error next to the card and allow another attempt. */
    }
  }
  const [open, setOpen] = useState(false);
  const busy = draft.status === "uploading" || state?.status === "processing";
  const failed = draft.status === "failed" || state?.status === "failed";
  const status =
    draft.status === "failed"
      ? t(draft.uploadError ?? "failed", {
          maxSize: (draft.uploadMaxBytes ?? 0) / (1024 * 1024),
        })
      : draft.status === "uploading"
        ? t("uploading")
        : state?.status === "failed"
          ? extractionT(`errors.${state.error}`)
          : state?.status === "processing"
            ? extractionT(state.phase === "queued" ? "queued" : "analyzing")
            : draft.version === "client_copy"
              ? t("batch.uploaded")
              : state?.status === "success"
                ? t("batch.read")
                : canExtract
                  ? extractionT("queued")
                  : t("batch.manualTypes");
  const documentState: DocumentStatusState = failed
    ? "failed"
    : draft.status === "uploading"
      ? "uploading"
      : state?.status === "processing"
        ? state.phase === "queued"
          ? "queued"
          : "analyzing"
        : draft.version === "client_copy"
          ? "uploaded"
          : state?.status === "success"
            ? "analyzed"
            : canExtract
              ? "queued"
              : "uploaded";
  const labels = {
    error: t("pdfPreviewError"),
    previousPage: t("previousPage"),
    nextPage: t("nextPage"),
    zoomIn: t("zoomIn"),
    zoomOut: t("zoomOut"),
    resetZoom: t("resetZoom"),
  };
  return (
    <li ref={cardRef} className="grid min-w-0 content-start gap-3">
      <DocumentPreview
        layout="paper"
        open={open}
        onOpenChange={(next) => {
          if (next) void openPreview();
          else setOpen(false);
        }}
        src={src}
        contentType={draft.file.type}
        fileName={draft.file.name}
        label={draft.file.name}
        triggerLabel={t("preview", { name: draft.file.name })}
        title={draft.file.name}
        imageAlt={draft.file.name}
        closeLabel={t("closePreview")}
        openFileLabel={t("openFile")}
        actionsLabel={t("actions")}
        pdfLabels={labels}
        zoomLabels={labels}
        disabled={previewLoading}
        viewerHeaderOverlay={
          <>
            <span className="min-w-0 flex-1 truncate py-2 text-sm font-medium">
              {draft.file.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("closePreview")}
              className="shrink-0 text-scrim-foreground hover:bg-media-scrim hover:text-scrim-foreground"
              onClick={() => setOpen(false)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </>
        }
        headerOverlay={
          <>
            <button
              type="button"
              className="min-w-0 flex-1 truncate py-2 text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-ring"
              title={draft.file.name}
              disabled={previewLoading}
              onClick={() => {
                void openPreview();
              }}
            >
              {draft.file.name}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-scrim-foreground hover:bg-media-scrim hover:text-scrim-foreground"
              disabled={disabled}
              aria-label={t("removeFile", { name: draft.file.name })}
              onClick={onRemove}
            >
              <XIcon className="size-4" aria-hidden="true" />
            </Button>
          </>
        }
        bottomOverlay={
          <>
            {draft.version === "client_copy" ? (
              <ScooterClientCopyBadge
                draft={draft}
                documents={documents}
                disabled={disabled || busy}
              />
            ) : (
              <ScooterDocumentTypeEditor
                surface="media"
                sourceId={draft.id}
                fileName={draft.file.name}
                type={draft.type}
                documents={
                  state?.status === "success"
                    ? state.analysis.extractedData.documents
                    : undefined
                }
                disabled={disabled || busy}
                onType={onType}
                onDocument={onLogicalDocument}
                scooterVin={scooterVin}
              />
            )}
            <DocumentStatus state={documentState} label={status} />
          </>
        }
      />
      <div className="grid min-w-0 gap-2">
        {draft.version === "client_copy" && !draft.originalId ? (
          <p className="text-sm text-muted-foreground">
            {workspace("copyNeedsOriginal")}
          </p>
        ) : null}
        {previewError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("pdfPreviewError")}
          </p>
        ) : null}
        {draft.fileUnavailable && draft.status === "failed" ? (
          <p role="alert" className="text-sm text-destructive">
            {t("interruptedUpload")}
          </p>
        ) : null}
        {failed &&
        draft.uploadError !== "sessionExpired" &&
        state?.status !== "processing" &&
        (draft.status === "failed" ||
          (state?.status === "failed" &&
            state.error !== "unknownType" &&
            state.error !== "disabled")) ? (
          <Button
            type="button"
            variant="text"
            className="justify-self-start"
            disabled={
              disabled ||
              Boolean(draft.fileUnavailable && draft.status === "failed")
            }
            onClick={onRetry}
          >
            {draft.status === "failed" ? t("retry") : extractionT("retry")}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

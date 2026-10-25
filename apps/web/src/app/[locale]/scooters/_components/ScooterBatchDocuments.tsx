"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { v1 } from "@repo/api-shared";
import { motion, spacing } from "@repo/theme";
import { DocumentPreview } from "@repo/ui/components/document-preview";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  FileDropZone,
  Spinner,
} from "@repo/ui/components";
import { FileDropOverlay } from "@repo/ui/components/file-drop-overlay";
import { useFileDrop } from "@repo/ui/hooks/use-file-drop";
import { useObjectUrl } from "@repo/ui/hooks/use-object-url";
import { CheckIcon, ShieldIcon, SparklesIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ScooterDocumentTypeEditor,
  type LogicalDocumentUpdate,
} from "./ScooterDocumentTypeEditor";
import type { DocumentImportResult } from "./scooter-document-import";
import { ScooterClientCopyBadge } from "./ScooterClientCopyBadge";
import { ScooterDocumentAnalysisContext } from "./ScooterDocumentAnalysisStatus";
import type {
  DocumentDraft,
  ScooterDocumentsEditor,
} from "./useScooterDocuments";

export function ScooterBatchDocuments({
  documents,
  disabled,
  analyzing,
  onRetryAnalysis,
  onCancelAnalysis,
  children,
  importResult,
  onLogicalDocument,
  scooterVin,
}: {
  documents: ScooterDocumentsEditor;
  disabled: boolean;
  analyzing: boolean;
  onRetryAnalysis?: (sourceId: string) => void;
  onCancelAnalysis?: () => void;
  children?: ReactNode;
  importResult?: Extract<DocumentImportResult, { ok: true }>;
  onLogicalDocument?: LogicalDocumentUpdate;
  scooterVin?: string;
}) {
  const t = useTranslations("scooters.documents");
  const user = useOptionalSession()?.user;
  const canWrite = canAccess(user, "scooter_documents.write");
  const canExtract = canAccess(user, "scooter_documents.extract");
  const creation = useTranslations("scooters.creation");
  const extraction = useTranslations("scooters.extraction");
  const workspace = useTranslations("scooters.workspace");
  const [initialDraftIds] = useState(
    () => new Set(documents.drafts.map((draft) => draft.id)),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [expandedImport, setExpandedImport] = useState<typeof importResult>();
  const analysisEntries = useContext(ScooterDocumentAnalysisContext);
  const compact =
    documents.existing.length + documents.drafts.length > 0 &&
    Boolean(importResult) &&
    expandedImport !== importResult &&
    !analyzing &&
    !errors.length &&
    !documents.drafts.some(
      (draft) =>
        (draft.version === "client_copy" && !draft.originalId) ||
        draft.status === "failed" ||
        draft.status === "uploading" ||
        analysisEntries[draft.id]?.status === "failed",
    );
  const logicalDocumentsFor = (sourceId: string) => {
    const entry = analysisEntries[sourceId];
    return entry?.status === "success"
      ? entry.analysis.extractedData.documents
      : documents.existing.find((item) => item.id === sourceId)?.extractedData
          ?.documents;
  };
  const attachedDocuments = [
    ...documents.existing.map((document) => ({
      id: document.id,
      name: document.fileName,
      type: document.type,
      clientCopy: false,
      originalName: undefined as string | undefined,
      analyzed: Boolean(
        document.extractedData ||
        documents.extractions[document.id] ||
        analysisEntries[document.id]?.status === "success",
      ),
    })),
  ];
  const { dragging, handlers: fileDropHandlers } = useFileDrop({
    disabled,
    onFiles: (files) => {
      setExpandedImport(importResult);
      add(files);
    },
  });

  if (!canWrite) return null;

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
          {canExtract ? (
            <Badge variant="outline">{creation("aiPowered")}</Badge>
          ) : null}
        </div>
        {!compact ? (
          <CardDescription>{creation("importAlternatives")}</CardDescription>
        ) : null}
      </CardHeader>
      {compact && attachedDocuments.length > 0 ? (
        <CardContent>
          <ul aria-label={t("batch.attached")} className="grid min-w-0 gap-2">
            {attachedDocuments.map((document) => (
              <li
                key={document.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-control px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    title={document.name}
                  >
                    {document.name}
                  </p>
                  {document.clientCopy ? (
                    <p className="text-xs text-muted-foreground">
                      {document.originalName
                        ? workspace("matchedOriginal", {
                            name: document.originalName,
                          })
                        : workspace("copyNeedsOriginal")}
                    </p>
                  ) : (
                    <ScooterDocumentTypeEditor
                      sourceId={document.id}
                      fileName={document.name}
                      type={document.type}
                      documents={logicalDocumentsFor(document.id)}
                      disabled={disabled || analyzing}
                      scooterVin={scooterVin}
                      onType={
                        documents.drafts.some(
                          (draft) =>
                            draft.id === document.id &&
                            draft.version !== "client_copy",
                        )
                          ? (type) =>
                              documents.classify(document.id, type, true)
                          : undefined
                      }
                      onDocument={
                        analysisEntries[document.id]?.status === "success"
                          ? onLogicalDocument
                          : undefined
                      }
                    />
                  )}
                </div>
                <Badge
                  variant={
                    document.clientCopy
                      ? "default"
                      : document.analyzed
                        ? "success"
                        : "secondary"
                  }
                >
                  {document.clientCopy ? (
                    <ShieldIcon aria-hidden="true" />
                  ) : null}
                  {document.clientCopy
                    ? t("clientCopy")
                    : t(
                        document.analyzed
                          ? "batch.uploadedAndAnalyzed"
                          : "batch.uploaded",
                      )}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
      <CardContent
        hidden={compact}
        className={compact ? "hidden" : "grid gap-4"}
      >
        <FileDropZone
          label={t("batch.drop")}
          browseLabel={t("batch.browse")}
          hint={t("batch.hint")}
          requirements={t("batch.requirements")}
          accept={v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES.join(",")}
          disabled={disabled}
          onFiles={add}
        />
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
      <CardContent className="grid min-w-0 gap-4">
        {documents.drafts.length ? (
          <>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {t("documentCount", { count: documents.drafts.length })}
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
            <ul
              aria-label={t("batch.attached")}
              className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
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
                  onType={(type) => documents.classify(draft.id, type, true)}
                  onRemove={() => documents.removeDraft(draft.id)}
                  onRetry={() =>
                    draft.status === "failed"
                      ? documents.retry(draft)
                      : onRetryAnalysis?.(draft.id)
                  }
                />
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">{t("batch.review")}</p>
          </>
        ) : null}
      </CardContent>
      {compact ? (
        <CardContent>
          {" "}
          <Button
            type="button"
            variant="outline"
            className="relative w-full justify-center rounded-dashed-surface border-(length:--dashed-surface-border-width) border-dashed bg-transparent text-center duration-normal enabled:hover:border-primary enabled:active:border-primary enabled:active:border-solid"
            disabled={disabled}
            aria-label={creation("importMore")}
            onClick={() => setExpandedImport(importResult)}
            {...fileDropHandlers}
          >
            {creation("importMore")}
            {dragging ? (
              <FileDropOverlay
                compact
                label={creation("importMore")}
                className="rounded-lg"
              />
            ) : null}
          </Button>
        </CardContent>
      ) : null}
      <CardContent hidden={compact} className={compact ? "hidden" : undefined}>
        {children ? (
          <div className="grid gap-3">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>{creation("or")}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {children}
          </div>
        ) : null}
      </CardContent>
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
            ? extractionT("analyzing")
            : draft.version === "client_copy"
              ? t("batch.uploaded")
              : state?.status === "success"
                ? t("batch.read")
                : canExtract
                  ? extractionT("queued")
                  : t("batch.manualTypes");
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
            <p
              role={failed ? "alert" : "status"}
              className={`flex min-w-0 items-center justify-end gap-1 text-right text-xs wrap-anywhere ${failed ? "rounded-md bg-destructive-subtle px-2 py-1 text-destructive" : "text-scrim-foreground"}`}
            >
              {busy ? (
                <Spinner className="shrink-0" />
              ) : state?.status === "success" ? (
                <CheckIcon
                  className="size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
              ) : null}
              {status}
            </p>
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

"use client";

import { v1 } from "@repo/api-shared";
import { Badge, Button } from "@repo/ui/components";
import { DocumentStatus } from "@repo/ui/components/document-status";
import { useMediaCollection } from "@repo/ui/components/media-collection";
import { DocumentPreview } from "@repo/ui/components/document-preview";
import { ShieldIcon, XIcon } from "lucide-react";
import { useContext, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { webApi } from "@/lib/api";
import { ScooterDocumentAnalysisContext } from "./ScooterDocumentAnalysisStatus";
import {
  ScooterDocumentTypeEditor,
  type LogicalDocumentUpdate,
} from "./ScooterDocumentTypeEditor";

export function SavedDocumentCard({
  document,
  disabled,
  onRemove,
  onLogicalDocument,
  scooterVin,
  clientCopy = false,
  lifecycleBadge,
}: {
  document: v1.scooters.ScooterDocument;
  disabled: boolean;
  onRemove: () => void;
  onLogicalDocument?: LogicalDocumentUpdate;
  scooterVin?: string;
  clientCopy?: boolean;
  lifecycleBadge?: ReactNode;
}) {
  const t = useTranslations("scooters.documents");
  const extraction = useTranslations("scooters.extraction");
  const [open, setOpen] = useState(false);
  const collection = useMediaCollection();
  const mediaId = clientCopy ? `${document.id}-copy` : document.id;
  function show() {
    if (!collection?.open(mediaId)) setOpen(true);
  }
  const entry = useContext(ScooterDocumentAnalysisContext)[document.id];
  const file = clientCopy ? document.clientCopy! : document;
  const processing = !clientCopy && entry?.status === "processing";
  const failed = !clientCopy && entry?.status === "failed";
  const extracted =
    !clientCopy &&
    Boolean(document.extractedData || entry?.status === "success");
  const labels = {
    error: t("pdfPreviewError"),
    previousPage: t("previousPage"),
    nextPage: t("nextPage"),
    zoomIn: t("zoomIn"),
    zoomOut: t("zoomOut"),
    resetZoom: t("resetZoom"),
  };
  return (
    <li className="grid min-w-0 content-start gap-3">
      <DocumentPreview
        layout="paper"
        mediaId={mediaId}
        open={open}
        onOpenChange={setOpen}
        src={webApi.url(file.contentUrl)}
        contentType={file.contentType}
        fileName={file.fileName}
        label={file.fileName}
        triggerLabel={t("preview", { name: file.fileName })}
        title={file.fileName}
        imageAlt={file.fileName}
        closeLabel={t("closePreview")}
        openFileLabel={t("openFile")}
        actionsLabel={t("actions")}
        pdfLabels={labels}
        zoomLabels={labels}
        headerOverlay={
          <>
            <button
              type="button"
              className="min-w-0 flex-1 truncate py-2 text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-ring"
              title={file.fileName}
              onClick={show}
            >
              {file.fileName}
            </button>
            {!clientCopy ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-scrim-foreground hover:bg-media-scrim hover:text-scrim-foreground"
                disabled={disabled || processing}
                aria-label={t("removeFile", { name: file.fileName })}
                onClick={onRemove}
              >
                <XIcon className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </>
        }
        viewerHeaderOverlay={
          <>
            <span className="min-w-0 flex-1 truncate py-2 text-sm font-medium">
              {file.fileName}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-scrim-foreground hover:bg-media-scrim hover:text-scrim-foreground"
              aria-label={t("closePreview")}
              onClick={() => setOpen(false)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </>
        }
        bottomOverlay={
          <>
            {lifecycleBadge}
            {clientCopy ? (
              <Badge>
                <ShieldIcon aria-hidden="true" />
                {t("clientCopy")}
              </Badge>
            ) : (
              <ScooterDocumentTypeEditor
                surface="media"
                sourceId={document.id}
                fileName={file.fileName}
                type={document.type}
                documents={
                  entry?.status === "success"
                    ? entry.analysis.extractedData.documents
                    : document.extractedData?.documents
                }
                disabled={disabled || processing}
                onDocument={onLogicalDocument}
                scooterVin={scooterVin}
              />
            )}
            <DocumentStatus
              state={
                failed
                  ? "failed"
                  : processing
                    ? entry.phase === "queued"
                      ? "queued"
                      : "analyzing"
                    : extracted
                      ? "analyzed"
                      : "uploaded"
              }
              label={
                processing
                  ? extraction(
                      entry.phase === "queued" ? "queued" : "analyzing",
                    )
                  : failed
                    ? extraction(`errors.${entry.error}`)
                    : t(extracted ? "batch.read" : "batch.uploaded")
              }
            />
          </>
        }
      />
    </li>
  );
}

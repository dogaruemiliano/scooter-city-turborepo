"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  Button,
  Input,
  Label,
} from "@repo/ui/components";
import { PdfPreview } from "@repo/ui/components/pdf-preview";
import { DocumentZoom } from "@repo/ui/components/document-zoom";
import { useObjectUrl } from "@repo/ui/hooks/use-object-url";
import {
  ArrowRightIcon,
  CheckIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { v1 } from "@repo/api-shared";
import { motion } from "@repo/theme";
import { StepProgress } from "@repo/ui/components/step-progress";
import type { ScooterVinCorrection } from "./scooter-vin-review";

export interface VinReviewDocument {
  sourceId: string;
  fileName: string;
  vin: string | null;
  originalVin: string | null;
  file?: File;
  src?: string;
  contentType?: string;
}

/** A manual vehicle identity, followed by explicit review of every differing reading. */
export function ScooterVinReview({
  documents,
  disabled,
  onApply,
  initialVin = "",
  showSummary = true,
  onClose,
}: {
  documents: VinReviewDocument[];
  disabled: boolean;
  onApply: (corrections: ScooterVinCorrection[], vin: string) => boolean | void;
  initialVin?: string;
  showSummary?: boolean;
  onClose?: () => void;
}) {
  const t = useTranslations("scooters.extraction.vinReview");
  const id = useId();
  const initial =
    v1.scooters.scooterDocumentExtractedDataSchema.shape.vin.safeParse(
      initialVin.trim().toUpperCase(),
    );
  const [step, setStep] = useState<"vin" | "documents">(
    initial.success &&
      initial.data &&
      documents.some((doc) => doc.vin !== initial.data)
      ? "documents"
      : "vin",
  );
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState(initialVin.trim().toUpperCase());
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState(false);
  const parsed =
    v1.scooters.scooterDocumentExtractedDataSchema.shape.vin.safeParse(
      value.trim().toUpperCase(),
    );
  const vin = parsed.success ? parsed.data : null;
  const mismatched = documents.filter((doc) => doc.vin !== vin);
  const corrections = mismatched.map((doc) => ({
    sourceId: doc.sourceId,
    previousVin: doc.vin,
    vin: vin!,
  }));

  function apply() {
    if (disabled || !vin) return;
    if (onApply(corrections, vin) === false) setError(true);
    else setOpen(false);
  }

  return (
    <>
      {showSummary ? (
        <Alert variant="warning">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>{t("title")}</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>{t("description")}</p>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className="justify-self-start"
              onClick={() => setOpen(true)}
            >
              {t("resume")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <BottomSheet
        dismissible={onClose ? !disabled : false}
        open={open && step === "vin"}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onClose?.();
        }}
      >
        <BottomSheetContent className="lg:w-[calc(var(--breakpoint-sm)-var(--spacing-16))]">
          <BottomSheetHeader>
            <BottomSheetTitle>{t("title")}</BottomSheetTitle>
            <BottomSheetDescription>{t("description")}</BottomSheetDescription>
          </BottomSheetHeader>
          <BottomSheetBody className="grid gap-6">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`${id}-vin`}>{t("vinLabel")}</Label>
              <Input
                id={`${id}-vin`}
                value={value}
                disabled={disabled}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="characters"
                aria-required="true"
                aria-invalid={Boolean(value && !vin)}
                aria-describedby={`${id}-vin-help`}
                onChange={(event) => {
                  setValue(event.target.value.toUpperCase());
                  setActiveIndex(0);
                  setError(false);
                }}
              />
              <p
                id={`${id}-vin-help`}
                className={
                  value && !vin
                    ? "text-sm text-destructive"
                    : "text-sm text-muted-foreground"
                }
              >
                {t("invalid")}
              </p>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {t("stale")}
              </p>
            ) : null}
          </BottomSheetBody>
          <BottomSheetFooter>
            <Button
              type="button"
              disabled={disabled || !vin}
              onClick={() => {
                if (!vin) return;
                if (mismatched.length) setStep("documents");
                else apply();
              }}
            >
              {t("continue")}
            </Button>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>
      <BottomSheet
        dismissible={onClose ? !disabled : false}
        showHandle={false}
        open={open && step === "documents"}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onClose?.();
        }}
      >
        <BottomSheetContent
          fullScreen
          className="lg:inset-4 lg:h-[calc(100dvh-var(--spacing-8))] lg:w-auto lg:rounded-2xl lg:border"
        >
          <BottomSheetTitle className="sr-only">
            {t("documentsTitle")}
          </BottomSheetTitle>
          <BottomSheetDescription className="sr-only">
            {t("documentsDescription")}
          </BottomSheetDescription>
          {mismatched[activeIndex] && vin ? (
            <DocumentConfirmation
              key={`${vin}-${mismatched[activeIndex].sourceId}-${open}`}
              document={mismatched[activeIndex]}
              documents={mismatched}
              activeIndex={activeIndex}
              vin={vin}
              active={open && step === "documents"}
              disabled={disabled}
              error={error}
              onChangeVin={() => {
                setStep("vin");
                setActiveIndex(0);
                setError(false);
              }}
              onContinue={() => {
                if (activeIndex < mismatched.length - 1)
                  setActiveIndex(activeIndex + 1);
                else apply();
              }}
            />
          ) : null}
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}

function DocumentConfirmation({
  document,
  documents,
  activeIndex,
  vin,
  active,
  disabled,
  error,
  onChangeVin,
  onContinue,
}: {
  document: VinReviewDocument;
  documents: VinReviewDocument[];
  activeIndex: number;
  vin: string;
  active: boolean;
  disabled: boolean;
  error: boolean;
  onChangeVin: () => void;
  onContinue: () => void;
}) {
  const t = useTranslations("scooters.extraction.vinReview");
  const [remaining, setRemaining] = useState(
    motion.duration.documentReviewPause / motion.duration.countdownTick,
  );
  useEffect(() => {
    if (!active) return;
    const deadline = Date.now() + motion.duration.documentReviewPause;
    const timer = setInterval(() => {
      const seconds = Math.max(
        0,
        Math.ceil((deadline - Date.now()) / motion.duration.countdownTick),
      );
      setRemaining(seconds);
      if (seconds === 0) clearInterval(timer);
    }, motion.duration.countdownTick);
    return () => clearInterval(timer);
  }, [active]);
  const last = activeIndex === documents.length - 1;
  const action = t(last ? "confirmAndFinish" : "confirmAndNext");
  return (
    <>
      <div className="shrink-0 border-b border-border px-8 py-3">
        <StepProgress
          activeIndex={activeIndex}
          label={t("progressLabel")}
          labels={documents.map((doc, index) =>
            t("documentStep", {
              current: index + 1,
              total: documents.length,
              name: doc.fileName,
            }),
          )}
        />
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2 lg:justify-start lg:gap-4 lg:px-6">
        <div className="grid min-w-0 gap-1">
          <p className="text-xs font-semibold text-muted-foreground">
            {t("vinLabel")}
          </p>
          <p className="text-sm font-semibold wrap-anywhere">{vin}</p>
        </div>
        <Button
          type="button"
          variant="text"
          size="sm"
          className="min-h-11 px-0 py-0 underline underline-offset-4 md:px-0 md:py-0"
          disabled={disabled}
          onClick={onChangeVin}
        >
          {t("back")}
        </Button>
      </div>
      <BottomSheetBody className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-4 lg:p-4">
        <VinDocumentPreview document={document} />
      </BottomSheetBody>
      <BottomSheetFooter className="gap-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
          <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="grid gap-2">
            <p>{t("continueConfirms")}</p>
            <p className="text-xs">
              {t("original", { vin: document.originalVin ?? t("unreadable") })}
            </p>
            {error ? (
              <p role="alert" className="text-destructive">
                {t("stale")}
              </p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          className="w-full lg:w-auto lg:min-w-64"
          disabled={disabled || !active || remaining > 0}
          onClick={() => {
            if (!disabled && active && remaining === 0) onContinue();
          }}
        >
          {last ? (
            <CheckIcon aria-hidden="true" />
          ) : (
            <ArrowRightIcon aria-hidden="true" />
          )}
          {remaining > 0
            ? t("waitToConfirm", { action, seconds: remaining })
            : action}
        </Button>
      </BottomSheetFooter>
    </>
  );
}

function VinDocumentPreview({ document }: { document: VinReviewDocument }) {
  const t = useTranslations("scooters.documents");
  const preview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    preview.current?.focus({ preventScroll: true });
  }, []);
  const localSrc = useObjectUrl(document.file ?? null);
  const src = localSrc ?? document.src;
  const contentType = document.file?.type ?? document.contentType;
  const labels = {
    error: t("pdfPreviewError"),
    previousPage: t("previousPage"),
    nextPage: t("nextPage"),
    zoomIn: t("zoomIn"),
    zoomOut: t("zoomOut"),
    resetZoom: t("resetZoom"),
  };
  return (
    <div
      ref={preview}
      tabIndex={-1}
      data-slot="vin-document-preview"
      role="region"
      aria-label={t("preview", { name: document.fileName })}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-control"
    >
      {src ? (
        contentType === "application/pdf" ? (
          <PdfPreview
            key={src}
            src={src}
            label={document.fileName}
            labels={labels}
            zoomLabels={labels}
          />
        ) : (
          <DocumentZoom key={src} labels={labels} caption={document.fileName}>
            {() => (
              // Local and authenticated document previews cannot use the image optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={document.fileName}
                draggable={false}
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}
          </DocumentZoom>
        )
      ) : (
        <p
          role="status"
          className="m-auto p-4 text-center text-sm text-muted-foreground"
        >
          {labels.error}
        </p>
      )}
    </div>
  );
}

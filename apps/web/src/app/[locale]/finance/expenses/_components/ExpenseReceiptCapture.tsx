"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetTitle,
  Button,
  Spinner,
} from "@repo/ui/components";
import {
  ArrowLeftIcon,
  ClipboardPenLineIcon,
  ImagesIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { FINANCE_PATHS } from "../../_lib/links";
import {
  analyzeExpenseReceipt,
  createExpense,
  createSupplier,
} from "../_lib/expense-api";
import {
  expenseFormDefaultsFromExtraction,
  toCreateExpenseInput,
  todayDateOnly,
  type ExpenseFormFocusField,
  type ExpenseFormValues,
} from "../_lib/expense-form";
import {
  cropReceiptImage,
  DEFAULT_RECEIPT_CROP,
  type CropRect,
} from "../_lib/receipt-image";
import { ExpenseExtractionReview } from "./ExpenseExtractionReview";
import { ReceiptCropper } from "./ReceiptCropper";

const ACCEPTED_RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type CaptureStage = "camera" | "crop" | "analyzing" | "review";
type CameraStatus = "requesting" | "ready" | "unavailable";

export interface ExpenseReceiptCaptureProps {
  books: readonly v1.finance.FinanceBook[];
  accounts: readonly v1.finance.LedgerAccount[];
  categories: readonly v1.finance.ExpenseCategory[];
  costObjects: readonly v1.finance.CostObject[];
  suppliers: readonly v1.finance.Supplier[];
  currentUserId: string;
}

export function ExpenseReceiptCapture({
  books,
  accounts,
  categories,
  costObjects,
  suppliers,
  currentUserId,
}: ExpenseReceiptCaptureProps) {
  const t = useTranslations("finance.expense.captureSheet");
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analyzedCropRef = useRef<CropRect | undefined>(undefined);
  const [stage, setStage] = useState<CaptureStage>("camera");
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("requesting");
  const [sourceFile, setSourceFile] = useState<File>();
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string>();
  const [crop, setCrop] = useState<CropRect>(DEFAULT_RECEIPT_CROP);
  const [draft, setDraft] = useState<v1.finance.ExpenseExtractionDraft>();
  const [reviewValues, setReviewValues] = useState<ExpenseFormValues>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const fallbackBook =
    books.find((book) => book.type === "ASSOCIATE_POOL") ?? books[0];

  const setCameraVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;

    if (video && cameraStreamRef.current) {
      video.srcObject = cameraStreamRef.current;
    }
  }, []);

  useEffect(() => {
    if (stage !== "camera") return;

    let active = true;
    let stream: MediaStream | undefined;
    const requestId = ++cameraRequestRef.current;

    async function startCamera() {
      if (!active || cameraRequestRef.current !== requestId) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        if (active && cameraRequestRef.current === requestId) {
          setCameraStatus("unavailable");
        }
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        if (!active || cameraRequestRef.current !== requestId) {
          stopStream(stream);
          return;
        }

        cameraStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (active && cameraRequestRef.current === requestId) {
          setCameraStatus("unavailable");
        }
      }
    }

    void startCamera();
    return () => {
      active = false;
      if (cameraRequestRef.current === requestId) {
        cameraRequestRef.current += 1;
      }
      if (cameraStreamRef.current === stream) {
        cameraStreamRef.current = null;
      }
      const video = videoRef.current;
      if (video && stream && video.srcObject === stream) {
        video.srcObject = null;
      }
      stopStream(stream);
    };
  }, [stage]);

  useEffect(
    () => () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    },
    [sourceUrl],
  );

  useEffect(
    () => () => {
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    },
    [receiptPreviewUrl],
  );

  function leaveCapture() {
    router.back();
  }

  function closeReview() {
    setStage("crop");
  }

  function selectFile(nextFile: File | undefined) {
    if (!nextFile) return;
    if (!ACCEPTED_RECEIPT_TYPES.has(nextFile.type)) {
      setError(t("unsupportedType"));
      return;
    }

    setSourceFile(nextFile);
    setSourceUrl(URL.createObjectURL(nextFile));
    setCrop(DEFAULT_RECEIPT_CROP);
    setDraft(undefined);
    setReviewValues(undefined);
    analyzedCropRef.current = undefined;
    setError(undefined);
    setStage("crop");
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError(t("cameraUnavailable"));
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError(t("cameraUnavailable"));
      return;
    }
    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToJpeg(canvas);
      selectFile(
        new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" }),
      );
    } catch {
      setError(t("cameraUnavailable"));
    }
  }

  function discardPhoto() {
    setSourceFile(undefined);
    setSourceUrl(undefined);
    setReceiptPreviewUrl(undefined);
    setDraft(undefined);
    setReviewValues(undefined);
    analyzedCropRef.current = undefined;
    setCrop(DEFAULT_RECEIPT_CROP);
    setError(undefined);
    setCameraStatus("requesting");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setStage("camera");
  }

  function cameraPreviewReady() {
    const stream = cameraStreamRef.current;
    if (
      stage === "camera" &&
      stream &&
      videoRef.current?.srcObject === stream
    ) {
      setCameraStatus("ready");
    }
  }

  async function processPhoto() {
    if (!sourceFile) return;
    if (
      draft?.status === "READY" &&
      draft.result &&
      reviewValues &&
      receiptPreviewUrl &&
      isSameCrop(analyzedCropRef.current, crop)
    ) {
      setError(undefined);
      setStage("review");
      return;
    }
    setStage("analyzing");
    setError(undefined);

    try {
      const cropped = await cropReceiptImage(sourceFile, crop);
      setReceiptPreviewUrl(URL.createObjectURL(cropped));
      const extraction = await analyzeExpenseReceipt(cropped);
      if (extraction.status !== "READY" || !extraction.result) {
        throw new Error(extraction.failureMessage ?? t("analyzeFailed"));
      }
      if (!fallbackBook) {
        throw new Error(t("analyzeFailed"));
      }
      setReviewValues(
        expenseFormDefaultsFromExtraction({
          extraction: extraction.result,
          books,
          accounts,
          categories,
          suppliers,
          currentUserId,
          fallbackBook,
          today: todayDateOnly(),
        }),
      );
      setDraft(extraction);
      analyzedCropRef.current = { ...crop };
      setStage("review");
    } catch (caught) {
      setError(messageForCaptureError(caught, t("analyzeFailed")));
      setStage("crop");
    }
  }

  async function saveExpense() {
    if (!draft || !reviewValues) return;
    setSaving(true);
    setError(undefined);
    try {
      let valuesToSave = reviewValues;
      const document = reviewValues.documents[0];
      if (
        !reviewValues.supplierId &&
        document?.supplierName &&
        document.supplierTaxId
      ) {
        const supplier = await createSupplier({
          name: document.supplierName,
          taxIdentifier: document.supplierTaxId,
        });
        valuesToSave = {
          ...reviewValues,
          supplierId: supplier.id,
          description: supplier.name,
          documents: reviewValues.documents.map((item, index) =>
            index === 0
              ? {
                  ...item,
                  supplierName: supplier.name,
                  supplierTaxId: supplier.taxIdentifier,
                }
              : item,
          ),
        };
        setReviewValues(valuesToSave);
      }
      const operation = await createExpense(
        {
          ...toCreateExpenseInput(valuesToSave),
          extractionDraftId: draft.id,
        },
        idempotencyKey,
      );
      router.push(FINANCE_PATHS.operation(operation.id));
      router.refresh();
    } catch (caught) {
      setError(messageForCaptureError(caught, t("saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  function editManually(focusField?: ExpenseFormFocusField) {
    if (!draft) return;
    const searchParams = new URLSearchParams({ draft: draft.id });

    if (focusField) {
      searchParams.set("focus", focusField);
    }

    router.push(`${FINANCE_PATHS.newExpenseManual}?${searchParams}`);
  }

  return (
    <>
      <section
        className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-mist-950 text-mist-50"
        data-slot="expense-capture-page"
        aria-describedby="expense-capture-description"
      >
        <h1 className="sr-only">{t("title")}</h1>
        <p id="expense-capture-description" className="sr-only">
          {t("description")}
        </p>
        {stage !== "crop" && stage !== "review" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("back")}
            onClick={leaveCapture}
            className="absolute top-[max(var(--spacing-4),env(safe-area-inset-top))] left-4 z-raised text-mist-50 hover:bg-mist-50/10 hover:text-mist-50"
          >
            <XIcon aria-hidden="true" />
          </Button>
        ) : null}

        {stage === "camera" ? (
          <CameraStage
            videoRef={setCameraVideo}
            cameraStatus={cameraStatus}
            error={error}
            onCapture={() => void capturePhoto()}
            onChoose={() => fileInputRef.current?.click()}
            onManual={() => router.push(FINANCE_PATHS.newExpenseManual)}
            onPreviewReady={cameraPreviewReady}
          />
        ) : null}

        {(stage === "crop" || stage === "review") && sourceUrl ? (
          <CropStage
            sourceUrl={sourceUrl}
            crop={crop}
            error={error}
            onCropChange={setCrop}
            onBack={discardPhoto}
            onUse={() => void processPhoto()}
          />
        ) : null}

        {stage === "analyzing" ? <AnalyzingStage /> : null}

        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => selectFile(event.target.files?.[0])}
          aria-label={t("choosePhoto")}
        />
      </section>

      <BottomSheet
        open={stage === "review"}
        onOpenChange={(open) => {
          if (!open && stage === "review") closeReview();
        }}
      >
        <BottomSheetContent className="h-[calc(100dvh-var(--spacing-12))] shadow-none lg:h-[calc(100dvh-var(--spacing-24))] lg:w-2xl">
          <BottomSheetTitle className="sr-only">
            {t("reviewTitle")}
          </BottomSheetTitle>
          <BottomSheetDescription className="sr-only">
            {t("reviewDescription")}
          </BottomSheetDescription>
          {draft && reviewValues && receiptPreviewUrl ? (
            <ExpenseExtractionReview
              draft={draft}
              values={reviewValues}
              previewUrl={receiptPreviewUrl}
              books={books}
              accounts={accounts}
              categories={categories}
              costObjects={costObjects}
              initialSuppliers={suppliers}
              currentUserId={currentUserId}
              saving={saving}
              error={error}
              onValuesChange={setReviewValues}
              onSave={() => void saveExpense()}
              onEditManually={editManually}
            />
          ) : null}
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}

function CameraStage({
  videoRef,
  cameraStatus,
  error,
  onCapture,
  onChoose,
  onManual,
  onPreviewReady,
}: {
  videoRef: React.RefCallback<HTMLVideoElement>;
  cameraStatus: CameraStatus;
  error?: string;
  onCapture: () => void;
  onChoose: () => void;
  onManual: () => void;
  onPreviewReady: () => void;
}) {
  const t = useTranslations("finance.expense.captureSheet");

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-mist-1000 text-mist-50">
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-label={t("cameraPreview")}
        className="absolute inset-0 size-full object-cover"
        onCanPlay={onPreviewReady}
      />
      <ReceiptGuide />
      <div
        data-slot="camera-top-scrim"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-scrim to-transparent"
        aria-hidden="true"
      />
      <div
        data-slot="camera-bottom-scrim"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-scrim to-transparent"
        aria-hidden="true"
      />
      {cameraStatus !== "ready" ? (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
          {cameraStatus === "requesting" ? (
            <Spinner className="size-6 text-mist-50" />
          ) : (
            <p className="max-w-sm text-sm text-mist-200">
              {t("cameraUnavailable")}
            </p>
          )}
        </div>
      ) : null}

      <div
        className="absolute inset-x-0 bottom-0 z-raised px-2 pt-4 pb-[max(var(--spacing-4),env(safe-area-inset-bottom))] sm:px-4"
        data-slot="camera-controls"
      >
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"
          data-slot="camera-actions"
        >
          <Button
            type="button"
            variant="text"
            size="icon"
            aria-label={t("choosePhoto")}
            onClick={onChoose}
            className="justify-self-start text-mist-100 hover:text-mist-50"
          >
            <ImagesIcon className="size-6" aria-hidden="true" />
          </Button>
          <button
            type="button"
            disabled={cameraStatus !== "ready"}
            aria-label={t("takePhoto")}
            onClick={onCapture}
            className="flex size-20 justify-self-center items-center justify-center rounded-full border-4 border-mist-50 bg-mist-50/15 outline-none transition-colors duration-fast ease-standard hover:bg-mist-50/25 focus-visible:ring-2 focus-visible:ring-mist-50 disabled:opacity-40"
          >
            <span
              className="size-16 rounded-full bg-mist-50"
              aria-hidden="true"
            />
          </button>
          <Button
            type="button"
            variant="text"
            size="icon"
            aria-label={t("manual")}
            onClick={onManual}
            className="justify-self-end text-mist-100 hover:text-mist-50"
          >
            <ClipboardPenLineIcon className="size-6" aria-hidden="true" />
          </Button>
        </div>
        {error ? (
          <p className="mt-2 text-center text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CropStage({
  sourceUrl,
  crop,
  error,
  onCropChange,
  onBack,
  onUse,
}: {
  sourceUrl: string;
  crop: CropRect;
  error?: string;
  onCropChange: (crop: CropRect) => void;
  onBack: () => void;
  onUse: () => void;
}) {
  const t = useTranslations("finance.expense.captureSheet");

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-mist-950 text-mist-50">
      <div className="grid h-[calc(var(--spacing-16)+env(safe-area-inset-top))] shrink-0 grid-cols-[var(--spacing-12)_1fr_var(--spacing-12)] items-center border-b border-mist-50/10 px-4 pt-[env(safe-area-inset-top)]">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("backToCamera")}
          onClick={onBack}
          className="text-mist-50 hover:bg-mist-50/10 hover:text-mist-50"
        >
          <ArrowLeftIcon aria-hidden="true" />
        </Button>
        <h2 className="text-center text-base font-semibold text-mist-50">
          {t("cropTitle")}
        </h2>
        <span aria-hidden="true" />
      </div>
      <ReceiptCropper
        sourceUrl={sourceUrl}
        crop={crop}
        onCropChange={onCropChange}
        imageAlt={t("cropPreview")}
        cornerLabel={(corner) => t(`cropCorners.${corner}`)}
      />
      {error ? (
        <p className="px-4 text-center text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <div className="shrink-0 px-4 pt-4 pb-[max(var(--spacing-4),env(safe-area-inset-bottom))] sm:px-6">
        <Button type="button" size="lg" onClick={onUse} className="w-full">
          {t("usePhoto")}
        </Button>
      </div>
    </div>
  );
}

function AnalyzingStage() {
  const t = useTranslations("finance.expense.captureSheet");
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-mist-950 px-6 text-center text-mist-50">
      <Spinner className="size-8" />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-mist-50">{t("analyzing")}</h2>
        <p className="text-sm text-mist-300">{t("analyzingHint")}</p>
      </div>
    </div>
  );
}

function ReceiptGuide() {
  const corner = "absolute size-12 border-mist-50/80";
  return (
    <div
      className="pointer-events-none absolute inset-x-8 top-24 bottom-32"
      aria-hidden="true"
    >
      <span className={`${corner} top-0 left-0 border-t-2 border-l-2`} />
      <span className={`${corner} top-0 right-0 border-t-2 border-r-2`} />
      <span className={`${corner} bottom-0 left-0 border-b-2 border-l-2`} />
      <span className={`${corner} right-0 bottom-0 border-r-2 border-b-2`} />
    </div>
  );
}

function stopStream(stream: MediaStream | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

function isSameCrop(left: CropRect | undefined, right: CropRect): boolean {
  return Boolean(
    left &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height,
  );
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Camera capture failed")),
      "image/jpeg",
      0.92,
    );
  });
}

function messageForCaptureError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

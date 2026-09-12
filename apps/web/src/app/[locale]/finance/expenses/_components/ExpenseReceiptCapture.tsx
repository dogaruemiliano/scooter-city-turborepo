"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetTitle,
  Button,
} from "@repo/ui/components";
import { ImageCapture } from "@repo/ui/components/image-capture";
import { ClipboardPenLineIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

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
import { ExpenseExtractionReview } from "./ExpenseExtractionReview";

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
  const readyReviewRef = useRef(false);
  const [captureOpen, setCaptureOpen] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string>();
  const [draft, setDraft] = useState<v1.finance.ExpenseExtractionDraft>();
  const [reviewValues, setReviewValues] = useState<ExpenseFormValues>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const fallbackBook =
    books.find((book) => book.type === "ASSOCIATE_POOL") ?? books[0];

  useEffect(
    () => () => {
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    },
    [receiptPreviewUrl],
  );

  function changeCaptureOpen(open: boolean) {
    setCaptureOpen(open);
    if (open) return;

    if (readyReviewRef.current) {
      readyReviewRef.current = false;
      setReviewOpen(true);
    } else if (!draft) {
      router.back();
    }
  }

  async function processPhoto(file: File) {
    setError(undefined);
    try {
      const extraction = await analyzeExpenseReceipt(file);
      if (extraction.status !== "READY" || !extraction.result) {
        throw new Error(extraction.failureMessage ?? t("analyzeFailed"));
      }
      if (!fallbackBook) throw new Error(t("analyzeFailed"));

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
      setReceiptPreviewUrl(URL.createObjectURL(file));
      readyReviewRef.current = true;
    } catch (caught) {
      throw new Error(messageForCaptureError(caught, t("analyzeFailed")));
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
        aria-label={t("title")}
      >
        {receiptPreviewUrl && !captureOpen ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("back")}
              onClick={() => router.back()}
              className="absolute top-[max(var(--spacing-4),env(safe-area-inset-top))] left-4 z-raised text-mist-50 hover:bg-mist-50/10 hover:text-mist-50"
            >
              <XIcon aria-hidden="true" />
            </Button>
            <div className="flex min-h-0 flex-1 items-center justify-center px-4 pt-[calc(var(--spacing-16)+env(safe-area-inset-top))]">
              {/* Object URLs are local to the browser and cannot use image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptPreviewUrl}
                alt={t("receiptPreview")}
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-3 px-4 pt-4 pb-[calc(var(--spacing-8)+env(safe-area-inset-bottom))] sm:px-6">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => setCaptureOpen(true)}
                className="text-mist-50 hover:bg-mist-50/10 hover:text-mist-50"
              >
                {t("retake")}
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={() => setReviewOpen(true)}
              >
                {t("reviewTitle")}
              </Button>
            </div>
          </>
        ) : null}
      </section>

      <ImageCapture
        open={captureOpen}
        onOpenChange={changeCaptureOpen}
        onCapture={processPhoto}
        allowGallery
        allowCrop
        labels={{
          title: t("title"),
          close: t("back"),
          capture: t("takePhoto"),
          choosePhoto: t("choosePhoto"),
          gallery: t("gallery"),
          files: t("files"),
          switchCamera: t("switchCamera"),
          startingCamera: t("startingCamera"),
          cameraUnavailable: t("cameraUnavailable"),
          retryCamera: t("retryCamera"),
          cropTitle: t("cropTitle"),
          cropHint: t("cropHint"),
          previewTitle: t("previewTitle"),
          previewAlt: t("cropPreview"),
          retake: t("retake"),
          usePhoto: t("usePhoto"),
          processing: t("analyzing"),
          unsupportedType: t("unsupportedType"),
          fileTooLarge: t("fileTooLarge"),
          captureFailed: t("captureFailed"),
          saveFailed: t("analyzeFailed"),
          resetCrop: t("resetCrop"),
          rotatePhoto: t("rotatePhoto"),
          straightenPhoto: t("straightenPhoto"),
          resetTilt: t("resetTilt"),
          editPhoto: t("editPhoto"),
          cancelEdit: t("cancelEdit"),
          rotationX: t("rotationX"),
          rotationY: t("rotationY"),
          adjustRotationX: t("adjustRotationX"),
          adjustRotationY: t("adjustRotationY"),
          resetEdits: t("resetEdits"),
          showEntirePhoto: t("showEntirePhoto"),
          cropCorner: (corner) => t(`cropCorners.${corner}`),
        }}
        cameraActions={
          <Button
            type="button"
            variant="text"
            size="icon"
            aria-label={t("manual")}
            onClick={() => router.push(FINANCE_PATHS.newExpenseManual)}
            className="text-mist-100 hover:text-mist-50"
          >
            <ClipboardPenLineIcon className="size-6" aria-hidden="true" />
          </Button>
        }
      />

      <BottomSheet open={reviewOpen} onOpenChange={setReviewOpen}>
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

function messageForCaptureError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

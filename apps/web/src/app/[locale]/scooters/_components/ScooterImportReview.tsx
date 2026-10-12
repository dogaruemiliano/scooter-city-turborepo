"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { FormFieldWarningsContext } from "@/components/form/FormField";
import { v1 } from "@repo/api-shared";
import type { DocumentSource } from "./scooter-document-sources";
import type { DocumentImportResult } from "./scooter-document-import";
import type { ScooterEditorValues } from "./scooter-editor-schema";
import {
  activeImportReviews,
  importFieldReviews,
  insuranceFieldReviews,
  remainingCivDocumentWarnings,
  unresolvedDocumentRubrics,
  type ImportFieldReview,
} from "./scooter-import-review";

const ImportReviewContext = createContext<{
  count: number;
  reviewFields: string[];
  documentWarnings: Array<{ sourceId?: string; fields: string[] }>;
  clearDocumentWarnings: (sourceId?: string) => void;
  reviewImport: (
    result: Extract<DocumentImportResult, { ok: true }>,
    snapshot: ScooterEditorValues,
  ) => void;
} | null>(null);

export function useScooterImportReview() {
  const context = useContext(ImportReviewContext);
  if (!context) throw new Error("Scooter import requires its review provider.");
  return context;
}

export function ScooterImportReviewProvider({
  children,
  editing,
  result,
  sources = [],
}: {
  children: ReactNode;
  editing: boolean;
  result?: Extract<DocumentImportResult, { ok: true }>;
  sources?: DocumentSource[];
}) {
  const { control, getValues } = useFormContext<ScooterEditorValues>();
  useWatch({ control });
  const values = getValues();
  const [reviews, setReviews] = useState<ImportFieldReview[]>(() =>
    insuranceFieldReviews(values.insurancePolicies ?? [], false),
  );
  const [documentWarnings, setDocumentWarnings] = useState<
    Array<{ sourceId?: string; fields: string[] }>
  >([]);
  const reviewImport = useCallback(
    (
      result: Extract<DocumentImportResult, { ok: true }>,
      snapshot: ScooterEditorValues,
    ) => {
      const fieldReviews = importFieldReviews(result, snapshot);
      setReviews(fieldReviews);
      const unmapped = unresolvedDocumentRubrics(result, snapshot);
      const documentFields = Object.entries(
        result.unresolvedDocumentFields ?? {},
      )
        .map(([sourceId, fields]) => {
          const type = sources.find(
            (source) => source.sourceId === sourceId,
          )?.type;
          return {
            sourceId,
            fields:
              type === "civ"
                ? remainingCivDocumentWarnings(fields, fieldReviews)
                : fields.filter((field) =>
                    type === "insurance"
                      ? !(
                          v1.scooters.INSURANCE_FIELDS as readonly string[]
                        ).includes(field)
                      : true,
                  ),
          };
        })
        .filter((item) => item.fields.length);
      const sourceCodes = new Set(
        documentFields.flatMap((item) => item.fields),
      );
      const legacy = unmapped.filter((code) => !sourceCodes.has(code));
      setDocumentWarnings([
        ...documentFields,
        ...(legacy.length ? [{ fields: legacy }] : []),
      ]);
    },
    [sources],
  );
  // Import and automatic re-attribution have one review snapshot. Later user edits
  // dismiss only the warning attached to the corrected value.
  const [previousResult, setPreviousResult] = useState(result);
  if (result !== previousResult) {
    setPreviousResult(result);
    if (result) reviewImport(result, getValues());
  }
  const t = useTranslations("scooters.documentImport");
  const scooterT = useTranslations("scooters");
  const active = activeImportReviews(reviews, values, editing);
  function fieldLabel(field: string, insurance = false) {
    const key = insurance
      ? `insurance.fields.${field}`
      : `fields.${field === "brandId" || field === "brandName" ? "brand" : field}`;
    return scooterT.has(key) ? scooterT(key) : field;
  }
  const reviewFields = [
    ...Object.values(active).map((review) => {
      const label = fieldLabel(review.field, Boolean(review.policyId));
      if (review.policyId) {
        const index =
          values.insurancePolicies?.findIndex(
            (policy) => policy.id === review.policyId,
          ) ?? -1;
        return `${scooterT("insurance.policy", { number: index + 1 })}: ${label}`;
      }
      return review.rawCodes.length
        ? `${label} (${review.rawCodes.join(", ")})`
        : label;
    }),
    ...documentWarnings.flatMap((warning) => {
      const source = sources.find((item) => item.sourceId === warning.sourceId);
      return warning.fields.map((field) => {
        const label = fieldLabel(field, source?.type === "insurance");
        return source ? `${source.fileName}: ${label}` : label;
      });
    }),
  ];
  const warnings = Object.fromEntries(
    Object.entries(active).map(([path, review]) => [
      path,
      review.rawCodes.length
        ? t("fieldReviewRaw", { fields: review.rawCodes.join(", ") })
        : t("fieldReview"),
    ]),
  );
  return (
    <ImportReviewContext
      value={{
        count: reviewFields.length,
        reviewFields,
        documentWarnings,
        clearDocumentWarnings: (sourceId) =>
          setDocumentWarnings((items) =>
            items.filter((item) => item.sourceId !== sourceId),
          ),
        reviewImport,
      }}
    >
      <FormFieldWarningsContext value={warnings}>
        {children}
      </FormFieldWarningsContext>
    </ImportReviewContext>
  );
}

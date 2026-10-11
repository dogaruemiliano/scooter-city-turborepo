"use client";

import { createContext, useContext } from "react";
import { useTranslations } from "next-intl";
import type { DocumentAnalysisState } from "./useScooterDocumentAnalysis";

export const ScooterDocumentAnalysisContext = createContext<
  Record<string, DocumentAnalysisState>
>({});

export function ScooterDocumentAnalysisStatus({
  sourceId,
}: {
  sourceId: string;
}) {
  const state = useContext(ScooterDocumentAnalysisContext)[sourceId];
  const t = useTranslations("scooters.extraction");
  if (state?.status === "success" && state.analysis.extractedData.vinReview)
    return (
      <p className="text-sm text-muted-foreground">{t("vinReview.reviewed")}</p>
    );
  if (state?.status !== "failed") return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {t(`errors.${state.error}`)}
    </p>
  );
}

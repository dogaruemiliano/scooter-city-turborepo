"use client";

import { createContext, useContext } from "react";
import type { ExtractionFieldKey, ExtractionState } from "./extraction-state";

export interface ExtractionReviewContextValue {
  state: ExtractionState;
  onApplySuggestion: (key: ExtractionFieldKey, suggestionId: string) => void;
}

export const ExtractionReviewContext =
  createContext<ExtractionReviewContextValue | null>(null);
export const useExtractionReview = () => useContext(ExtractionReviewContext);

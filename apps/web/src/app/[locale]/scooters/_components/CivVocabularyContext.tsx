"use client";
import { createContext, useContext } from "react";
import type { v1 } from "@repo/api-shared";
export type CivVocabulary = {
  field: v1.vehicleCiv.CivVocabularyField;
  value: string;
}[];
export const CivVocabularyContext = createContext<CivVocabulary>([]);
export const useCivVocabulary = () => useContext(CivVocabularyContext);

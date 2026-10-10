"use client";

import { v1 } from "@repo/api-shared";
import type { CivVocabulary } from "./CivVocabularyContext";
import { ScooterEditor } from "./ScooterEditor";

export function ScooterCreateForm({
  scootersHref,
  brands,
  vocabulary,
}: {
  scootersHref: string;
  brands: v1.scooterBrands.ScooterBrand[];
  vocabulary?: CivVocabulary;
}) {
  return (
    <ScooterEditor
      vocabulary={vocabulary}
      returnHref={scootersHref}
      brands={brands}
    />
  );
}

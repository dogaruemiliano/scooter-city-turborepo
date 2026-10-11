"use client";

import { v1 } from "@repo/api-shared";
import type { CivVocabulary } from "./CivVocabularyContext";
import { ScooterEditor } from "./ScooterEditor";

export function ScooterEditForm({
  scooter,
  scooterHref,
  brands,
  vocabulary,
}: {
  scooter: v1.scooters.Scooter;
  scooterHref: string;
  brands: v1.scooterBrands.ScooterBrand[];
  vocabulary?: CivVocabulary;
}) {
  return (
    <ScooterEditor
      vocabulary={vocabulary}
      key={scooter.id}
      scooter={scooter}
      returnHref={scooterHref}
      brands={brands}
    />
  );
}

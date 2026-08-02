"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { ListFilterSheet } from "@/components/ListFilterSheet";

interface UrlFilterSheetProps {
  appliedCount: number;
  applyLabel: string;
  baseHref: string;
  children: ReactNode;
  description: string;
  formId: string;
  resetLabel: string;
  title: string;
}

export function UrlFilterSheet({
  appliedCount,
  applyLabel,
  baseHref,
  children,
  description,
  formId,
  resetLabel,
  title,
}: UrlFilterSheetProps) {
  const router = useRouter();

  function applyFilters(formData: FormData) {
    const params = new URLSearchParams();
    for (const [name, value] of formData.entries()) {
      if (typeof value === "string" && value) params.set(name, value);
    }

    const query = params.toString();
    router.push(query ? `${baseHref}?${query}` : baseHref);
  }

  return (
    <ListFilterSheet
      appliedCount={appliedCount}
      applyLabel={applyLabel}
      description={description}
      formId={formId}
      onApply={applyFilters}
      onReset={() => router.push(baseHref)}
      resetLabel={resetLabel}
      title={title}
    >
      {children}
    </ListFilterSheet>
  );
}

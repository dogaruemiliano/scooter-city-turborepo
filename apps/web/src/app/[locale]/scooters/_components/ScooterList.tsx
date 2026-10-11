"use client";

import { v1 } from "@repo/api-shared";
import { useTranslations } from "next-intl";

import { ScooterCard } from "./ScooterCard";

export function ScooterList({
  items,
}: {
  items: v1.scooters.ScooterListItem[];
}) {
  const t = useTranslations("scooters");
  if (!items.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {t("list.empty")}
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {items.map((scooter) => (
        <li key={scooter.id} className="min-w-0">
          <ScooterCard scooter={scooter} />
        </li>
      ))}
    </ul>
  );
}

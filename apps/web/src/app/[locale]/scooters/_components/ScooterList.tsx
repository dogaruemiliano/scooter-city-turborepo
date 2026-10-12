"use client";

import { v1 } from "@repo/api-shared";
import { ListEmpty, ListItems } from "@repo/ui/components";
import { useTranslations } from "next-intl";

import { ScooterCard } from "./ScooterCard";

export function ScooterList({
  items,
  emptyMessage,
}: {
  items: v1.scooters.ScooterListItem[];
  emptyMessage?: string;
}) {
  const t = useTranslations("scooters");
  return (
    <ListItems
      items={items}
      getItemKey={(scooter) => scooter.id}
      renderItem={(scooter) => <ScooterCard scooter={scooter} />}
      empty={<ListEmpty>{emptyMessage ?? t("list.empty")}</ListEmpty>}
    />
  );
}

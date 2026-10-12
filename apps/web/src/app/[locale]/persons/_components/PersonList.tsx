"use client";

import { v1 } from "@repo/api-shared";
import { ListEmpty, ListItems } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { PersonListItem } from "./PersonListItem";

export function PersonList({
  items,
  emptyMessage,
}: {
  items: v1.persons.Person[];
  emptyMessage?: string;
}) {
  const t = useTranslations("persons");
  return (
    <ListItems
      items={items}
      getItemKey={(person) => person.id}
      renderItem={(person) => <PersonListItem person={person} />}
      empty={<ListEmpty>{emptyMessage ?? t("list.empty")}</ListEmpty>}
    />
  );
}

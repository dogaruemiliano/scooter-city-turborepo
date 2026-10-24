"use client";

import { useCallback, useMemo } from "react";
import { v1 } from "@repo/api-shared";
import { Button, SheetSelect } from "@repo/ui/components";
import { buttonVariants } from "@repo/ui/components/button";
import type { SheetSelectProps } from "@repo/ui/components/sheet-select";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@repo/ui/lib/utils";
import { PersonIdentityRow } from "./PersonIdentity";
import { webApi } from "@/lib/api";
import { Feedback, useRemote } from "./WorkspaceForm";

export type PersonSelectItem = Pick<
  v1.persons.Person,
  "id" | "firstName" | "lastName" | "phone" | "email"
> &
  Partial<Pick<v1.persons.Person, "documents">> & { avatarUrl?: string };

const EMPTY_PERSONS: readonly PersonSelectItem[] = [];

export async function loadPersonSelectItems(): Promise<PersonSelectItem[]> {
  const items: PersonSelectItem[] = [];
  for (let page = 1; ; page++) {
    const list = await webApi.fetch(
      `/v1/persons?pageSize=100&page=${page}`,
      v1.persons.personListSchema,
      { cache: "no-store" },
    );
    items.push(
      ...list.items
        .filter((person) => !person.deletedAt)
        .map(({ id, firstName, lastName, phone, email, documents }) => ({
          id,
          firstName,
          lastName,
          phone,
          email,
          documents,
        })),
    );
    if (page * list.pageSize >= list.total || !list.items.length) break;
  }
  return items;
}

export function PersonSelectRow({ person }: { person: PersonSelectItem }) {
  return <PersonIdentityRow person={person} />;
}

type Props = Omit<
  SheetSelectProps,
  | "multiple"
  | "value"
  | "onValueChange"
  | "options"
  | "label"
  | "renderOption"
  | "triggerContent"
> & {
  label?: string;
  value: string;
  onValueChange: (id: string) => void;
  persons?: readonly PersonSelectItem[];
  onAddPerson?: () => void;
};

/** Shared person identity in the search sheet and the selected-person surface. */
export function PersonSelect({
  persons: supplied,
  label,
  onAddPerson,
  ...props
}: Props) {
  const t = useTranslations("workspace.personSelect");
  const load = useCallback(
    () =>
      supplied !== undefined
        ? Promise.resolve(supplied)
        : loadPersonSelectItems(),
    [supplied],
  );
  const remote = useRemote(load);
  const persons = supplied ?? remote.data ?? EMPTY_PERSONS;
  const byId = useMemo(
    () => new Map(persons.map((person) => [person.id, person])),
    [persons],
  );
  const selected = byId.get(props.value);
  return (
    <div className="flex flex-col gap-2">
      <SheetSelect
        label={label ?? t("personSelect")}
        placeholder={t("personSelect")}
        searchPlaceholder={t("personSearch")}
        clearSearchLabel={t("clearSearch")}
        closeLabel={t("close")}
        emptyMessage={
          supplied === undefined && remote.loading
            ? t("loading")
            : (remote.error ?? t("noPersons"))
        }
        {...props}
        triggerVariant="card"
        className={cn(
          selected && "h-auto min-h-24 bg-selectable-row md:h-auto",
          props.className,
        )}
        addAction={
          !selected
            ? { text: t("personSelect"), icon: <PlusIcon /> }
            : undefined
        }
        triggerContent={
          selected ? (
            <>
              <PersonSelectRow person={selected} />
              <span
                aria-hidden="true"
                className={buttonVariants({
                  variant: "outline",
                  size: "icon-sm",
                })}
              >
                <PencilIcon className="size-4" />
              </span>
            </>
          ) : undefined
        }
        options={persons.map((person) => ({
          value: person.id,
          label: `${person.firstName} ${person.lastName} · ${person.phone} · ${person.email}`,
        }))}
        renderOption={(option) => (
          <PersonSelectRow person={byId.get(option.value)!} />
        )}
        renderHeaderAction={
          onAddPerson
            ? () => (
                <Button
                  type="button"
                  variant="outline"
                  disabled={props.disabled}
                  onClick={onAddPerson}
                >
                  <PlusIcon aria-hidden="true" />
                  {t("addPerson")}
                </Button>
              )
            : undefined
        }
      />
      {supplied === undefined ? (
        <>
          <Feedback error={remote.error} />
          {remote.error ? (
            <Button type="button" variant="outline" onClick={remote.reload}>
              {t("retry")}
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

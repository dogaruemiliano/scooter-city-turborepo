"use client";
import { useCallback, useDeferredValue, useState } from "react";
import { v1 } from "@repo/api-shared";
import { Field, FieldLabel, Input } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { webApi } from "@/lib/api";
import { Choice, Feedback, useRemote } from "./WorkspaceForm";

export function EntityPicker({
  kind,
  label,
  value,
  onChange,
}: {
  kind: "persons" | "scooters";
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("workspace");
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const load = useCallback(async () => {
    const query = new URLSearchParams({ pageSize: "100", search: deferred });
    if (kind === "persons") {
      const list = await webApi.fetch(
        `/v1/persons?${query}`,
        v1.persons.personListSchema,
        { cache: "no-store" },
      );
      return list.items.map((item) => ({
        value: item.id,
        label: `${item.firstName} ${item.lastName}`,
      }));
    }
    const list = await webApi.fetch(
      `/v1/scooters?${query}`,
      v1.scooters.scooterListSchema,
      { cache: "no-store" },
    );
    return list.items.map((item) => ({
      value: item.id,
      label: v1.scooters.scooterDisplayCode(item),
    }));
  }, [kind, deferred]);
  const remote = useRemote(load);
  return (
    <div className="flex flex-col gap-2">
      <Field>
        <FieldLabel htmlFor={`${kind}-search`}>
          {t("search")} · {label}
        </FieldLabel>
        <Input
          id={`${kind}-search`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      <Choice
        label={label}
        value={value}
        onChange={onChange}
        options={[{ value: "", label: t("select") }, ...(remote.data ?? [])]}
      />
      <Feedback error={remote.error} />
    </div>
  );
}

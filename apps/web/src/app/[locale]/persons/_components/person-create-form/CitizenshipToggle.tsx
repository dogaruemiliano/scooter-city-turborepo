"use client";

import { Button } from "@repo/ui/components";
import { useTranslations } from "next-intl";

import type { PersonCitizenship } from "./types";

export function CitizenshipToggle({
  citizenship,
  onChange,
}: {
  citizenship: PersonCitizenship;
  onChange: (citizenship: PersonCitizenship) => void;
}) {
  const t = useTranslations("persons");

  return (
    <div
      role="group"
      aria-label={t("citizenship.label")}
      className="relative grid grid-cols-2 rounded-lg border border-border bg-muted p-1"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 right-1 left-1 grid grid-cols-2"
      >
        <span
          className={[
            "rounded-md bg-background shadow-sm transition-transform duration-fast ease-standard",
            citizenship === "foreign" ? "translate-x-full" : "translate-x-0",
          ].join(" ")}
        />
      </span>
      <Button
        type="button"
        variant="ghost"
        className={[
          "relative z-raised w-full bg-transparent hover:bg-transparent",
          citizenship === "romanian"
            ? "text-foreground"
            : "text-muted-foreground",
        ].join(" ")}
        aria-pressed={citizenship === "romanian"}
        onClick={() => onChange("romanian")}
      >
        {t("citizenship.romanian")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className={[
          "relative z-raised w-full bg-transparent hover:bg-transparent",
          citizenship === "foreign"
            ? "text-foreground"
            : "text-muted-foreground",
        ].join(" ")}
        aria-pressed={citizenship === "foreign"}
        onClick={() => onChange("foreign")}
      >
        {t("citizenship.foreign")}
      </Button>
    </div>
  );
}

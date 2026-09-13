"use client";

import { Button } from "@repo/ui/components";
import { useTranslations } from "next-intl";

import type { PersonCitizenship } from "./types";

export function CitizenshipChoice({
  onChange,
}: {
  onChange: (value: PersonCitizenship) => void;
}) {
  const t = useTranslations("persons");
  return (
    <section
      className="grid gap-4 sm:grid-cols-2"
      aria-label={t("wizard.steps.citizenship")}
    >
      <Button
        type="button"
        variant="outline"
        className="h-auto min-h-48 flex-col gap-4 rounded-xl bg-card p-6 text-card-foreground whitespace-normal md:h-auto"
        onClick={() => onChange("romanian")}
      >
        {/* A local vector flag stays sharp without image optimization. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/flag-romania.svg"
          alt=""
          className="h-8 w-12 rounded-sm object-cover"
        />
        <span className="text-base font-semibold">
          {t("citizenship.romanian")}
        </span>
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-auto min-h-48 flex-col gap-4 rounded-xl bg-card p-6 text-card-foreground whitespace-normal md:h-auto"
        onClick={() => onChange("foreign")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/international.svg"
          alt=""
          className="size-10 object-contain"
        />
        <span className="text-base font-semibold">
          {t("citizenship.foreign")}
        </span>
      </Button>
    </section>
  );
}

"use client";

import { v1 } from "@repo/api-shared";
import { Card, CardContent } from "@repo/ui/components";
import { buildDateOnly } from "@repo/ui/lib/date-parts";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PersonProfileSection } from "../PersonDetailPage/PersonProfileSection";
import { PersonContactSection } from "../PersonDetailPage/PersonContactSection";
import { PersonAddressSection } from "../PersonDetailPage/PersonAddressSection";
import type { CreatePersonFormState } from "./types";

/** Review the unsaved person using the same sections as the detail page. */
export function PersonCreateReview({
  form,
  locale,
  notes,
  documents,
}: {
  form: CreatePersonFormState;
  locale: string;
  notes: ReactNode;
  documents: ReactNode;
}) {
  const t = useTranslations("persons");
  const person = {
    ...form,
    dateOfBirth:
      form.citizenship === "romanian"
        ? (v1.persons.getDateOfBirthFromCnp(form.cnp) ?? null)
        : (buildDateOnly(form.dateOfBirth).value ?? null),
  };
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="text-sm text-muted-foreground">{t("wizard.reviewHelp")}</p>
      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <PersonProfileSection person={person} locale={locale} revealCnp />
        </div>
        <PersonContactSection person={person} />
        <div className="min-w-0 lg:col-span-2">
          <PersonAddressSection person={person} />
        </div>
        <Card className="min-w-0">
          <CardContent>{notes}</CardContent>
        </Card>
      </div>
      {documents}
    </div>
  );
}

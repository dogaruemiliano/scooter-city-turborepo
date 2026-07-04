"use client";

import { Button, buttonVariants } from "@repo/ui/components";
import { UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function FormActions({
  creating,
  uploadingPhotos,
  personsHref,
}: {
  creating: boolean;
  uploadingPhotos: boolean;
  personsHref: string;
}) {
  const t = useTranslations("persons");

  return (
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
      {creating ? (
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          disabled
        >
          {t("actions.cancel")}
        </Button>
      ) : (
        <Link
          href={personsHref}
          className={buttonVariants({
            variant: "outline",
            className: "w-full sm:w-auto",
          })}
        >
          {t("actions.cancel")}
        </Link>
      )}
      <Button
        type="submit"
        className="w-full sm:w-auto"
        disabled={creating || uploadingPhotos}
      >
        <UserPlusIcon data-icon="inline-start" />
        {creating
          ? t("actions.creating")
          : uploadingPhotos
            ? t("actions.uploadingDocumentPhoto")
            : t("actions.create")}
      </Button>
    </div>
  );
}

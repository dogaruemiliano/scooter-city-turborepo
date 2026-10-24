"use client";

import { useEffect, useState } from "react";
import { buttonVariants } from "@repo/ui/components/button";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { canPersistRentalDraft, readRentalDraft } from "../_lib/rental-draft";

export function RentalCreateAction({ userId }: { userId: string }) {
  const t = useTranslations("workspace.rentals");
  const [hasDraft, setHasDraft] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        const draft = readRentalDraft(userId);
        setHasDraft(Boolean(draft && canPersistRentalDraft(draft)));
      } catch {
        setHasDraft(false);
      }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("focus", read);
    };
  }, [userId]);
  return (
    <Link href="/rentals/new" className={buttonVariants()}>
      {hasDraft ? t("wizard.resume") : t("add")}
    </Link>
  );
}

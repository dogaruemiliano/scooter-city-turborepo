"use client";

import { v1 } from "@repo/api-shared";
import { buttonVariants, Separator } from "@repo/ui/components";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { COMPANY_PATHS } from "../../../company/_lib/links";
import { FinanceBookForm } from "./FinanceBookForm";

export function FinanceBooksSettings({
  initialBooks,
}: {
  initialBooks: v1.finance.FinanceBook[];
}) {
  const t = useTranslations("finance.configuration");
  const locale = resolveRouteLocale(useLocale());
  const [books, setBooks] = useState(initialBooks);
  const hasCompany = books.some((book) => book.type === "COMPANY");
  function onSaved(saved: v1.finance.FinanceBook) {
    setBooks((current) => [
      ...current.filter((book) => book.id !== saved.id),
      saved,
    ]);
  }
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      {v1.finance.FINANCE_BOOK_TYPES.map((type) => {
        const book = books.find((candidate) => candidate.type === type);
        return (
          <FinanceBookForm
            key={type}
            type={type}
            book={book}
            disabled={type === "ASSOCIATE_POOL" && !hasCompany}
            onSaved={onSaved}
          />
        );
      })}
      {books.length === v1.finance.FINANCE_BOOK_TYPES.length ? (
        <>
          <Separator />
          <div className="flex flex-col items-start gap-3">
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={localizePath(COMPANY_PATHS.associates, locale)}
            >
              {t("manageAssociates")}
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import { FinancePageHeader } from "../_components/FinancePageHeader";
import {
  financeCookieHeader,
  handleFinanceApiErrors,
  requireFinanceAdmin,
} from "../_lib/server";
import { CategoryTable } from "./_components/CategoryTable";
import { CreateCategoryDialog } from "./_components/CreateCategoryDialog";

const CATEGORIES_PATH = "/finance/categories";

interface CategoriesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: CategoriesPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].finance.categories.title };
}

export default async function CategoriesPage({ params }: CategoriesPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  await requireFinanceAdmin(locale, CATEGORIES_PATH);
  const cookieHeader = await financeCookieHeader();
  const categories = await handleFinanceApiErrors(locale, CATEGORIES_PATH, () =>
    webApi.fetch(
      v1.finance.ROUTES.categories.list,
      v1.finance.financialCategoryListSchema,
      {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      },
    ),
  );
  const t = await getTranslations({ locale, namespace: "finance" });

  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <FinancePageHeader
        title={t("categories.title")}
        description={t("categories.description")}
        action={<CreateCategoryDialog categories={categories.items} />}
      />
      <CategoryTable categories={categories.items} />
    </main>
  );
}

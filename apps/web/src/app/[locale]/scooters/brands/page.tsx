import { PageLayout } from "@repo/ui/components/page-layout";
import { canAccess } from "@/lib/access";
import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { Button, ListLayout } from "@repo/ui/components";
import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import {
  getLocalizedSignInPath,
  localizePath,
  resolveRouteLocale,
} from "@/i18n/paths";
import { webApi } from "@/lib/api";
import { meFromApi } from "@/lib/auth-server";
import { BrandFormSheet } from "../_components/BrandFormSheet";
import { BrandTable } from "../_components/BrandTable";

const BRANDS_PATH = "/scooters/brands";

interface BrandsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: BrandsPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].appShell.pages.scooterBrands };
}

export default async function BrandsPage({ params }: BrandsPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const user = await meFromApi();

  if (!user) {
    redirect(getLocalizedSignInPath(locale, localizePath(BRANDS_PATH, locale)));
  }

  if (!canAccess(user, "scooter_brands.read")) {
    notFound();
  }

  const cookieHeader = (await cookies()).toString();
  const brands = await brandsFromApi(locale, cookieHeader);
  const t = await getTranslations({ locale, namespace: "scooters" });

  return (
    <PageLayout className="gap-8">
      <ListLayout
        action={
          canAccess(user, "scooter_brands.manage") ? (
            <BrandFormSheet
              trigger={
                <Button type="button">
                  <PlusIcon aria-hidden="true" data-icon="inline-start" />
                  {t("brands.list.createButton")}
                </Button>
              }
            />
          ) : null
        }
      >
        <BrandTable brands={brands.items} />
      </ListLayout>
    </PageLayout>
  );
}

async function brandsFromApi(
  locale: ReturnType<typeof resolveRouteLocale>,
  cookieHeader: string,
): Promise<v1.scooterBrands.ScooterBrandList> {
  try {
    return await webApi.fetch(
      v1.scooterBrands.ROUTES.list,
      v1.scooterBrands.scooterBrandListSchema,
      { headers: { cookie: cookieHeader }, cache: "no-store" },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(
        getLocalizedSignInPath(locale, localizePath(BRANDS_PATH, locale)),
      );
    }
    if (error instanceof ApiError && error.status === 403) {
      notFound();
    }
    throw error;
  }
}

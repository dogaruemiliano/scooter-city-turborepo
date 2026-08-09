import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { Button } from "@repo/ui/components";
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
const ADMIN_ROLE = "ADMIN";

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

  if (!user.roles.includes(ADMIN_ROLE)) {
    notFound();
  }

  const cookieHeader = (await cookies()).toString();
  const brands = await brandsFromApi(locale, cookieHeader);
  const t = await getTranslations({ locale, namespace: "scooters" });

  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex justify-end">
        <BrandFormSheet
          trigger={
            <Button type="button">
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              {t("brands.list.createButton")}
            </Button>
          }
        />
      </div>
      <BrandTable brands={brands.items} />
    </main>
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

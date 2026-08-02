import { redirect } from "next/navigation";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";

interface WalletsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function WalletsPage({ params }: WalletsPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  redirect(localizePath("/finance", locale));
}

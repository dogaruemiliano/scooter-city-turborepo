import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { resolveRouteLocale } from "@/i18n/paths";
import { requireAccess } from "@/lib/access-server";

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireAccess(
    resolveRouteLocale(locale),
    "/todos",
    "problems.read",
  );
  if (!user.isAdmin && !user.isSuperAdmin) notFound();
  return children;
}

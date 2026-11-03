import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/access-server";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { NotificationsWorkspace } from "./_components/NotificationsWorkspace";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: Pick<PageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  return { title: messages[resolveRouteLocale(locale)].notifications.title };
}

export default async function Page({ params, searchParams }: PageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  await requireAccess(
    resolveRouteLocale(locale),
    "/notifications",
    "notifications.receive",
  );
  if (query.tab === "settings") {
    redirect(
      localizePath(
        "/account/settings#notifications",
        resolveRouteLocale(locale),
      ),
    );
  }
  const openId =
    typeof query.open === "string" && query.open.length <= 200
      ? query.open
      : undefined;
  return (
    <NotificationsWorkspace key={openId ?? "notifications"} openId={openId} />
  );
}

import { resolveRouteLocale } from "@/i18n/paths";
import { requireAccess } from "@/lib/access-server";
import { ProblemDetailScreen } from "../_components/ProblemDetailScreen";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireAccess(
    resolveRouteLocale(locale),
    `/problems/${encodeURIComponent(id)}`,
    "problems.read",
  );
  return <ProblemDetailScreen id={id} />;
}

import { resolveRouteLocale } from "@/i18n/paths";
import { requireAccess } from "@/lib/access-server";
import { ProblemEditScreen } from "../../_components/ProblemEditScreen";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireAccess(
    resolveRouteLocale(locale),
    `/problems/${encodeURIComponent(id)}/edit`,
    "problems.update",
  );
  return <ProblemEditScreen id={id} />;
}

import { resolveRouteLocale } from "@/i18n/paths";
import { requireAccess } from "@/lib/access-server";
import { ProblemEditScreen } from "../../../problems/_components/ProblemEditScreen";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireAccess(
    resolveRouteLocale(locale),
    `/todos/${encodeURIComponent(id)}/edit`,
    "problems.update",
  );
  return <ProblemEditScreen id={id} todo />;
}

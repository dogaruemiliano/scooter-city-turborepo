import { resolveRouteLocale } from "@/i18n/paths";
import { requireAccess } from "@/lib/access-server";
import { ProblemCreateScreen } from "../../problems/_components/ProblemCreateScreen";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAccess(
    resolveRouteLocale(locale),
    "/todos/new",
    "problems.create",
  );
  return <ProblemCreateScreen todo />;
}

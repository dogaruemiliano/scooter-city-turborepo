import { resolveRouteLocale } from "@/i18n/paths";
import { requireAccess } from "@/lib/access-server";
import { ProblemsWorkspace } from "../problems/_components/ProblemsWorkspace";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const values = await params;
  await requireAccess(
    resolveRouteLocale(values.locale),
    "/problems",
    "problems.read",
  );
  return <ProblemsWorkspace />;
}

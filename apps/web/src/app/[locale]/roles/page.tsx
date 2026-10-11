import { resolveRouteLocale } from "@/i18n/paths";
import { requireAccess } from "@/lib/access-server";
import { RolesWorkspace } from "../roles/_components/RolesWorkspace";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const values = await params;
  await requireAccess(resolveRouteLocale(values.locale), "/roles");
  return <RolesWorkspace />;
}

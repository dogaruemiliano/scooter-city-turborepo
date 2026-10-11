import { resolveRouteLocale } from "@/i18n/paths";
import { requireAccess } from "@/lib/access-server";
import { UsersWorkspace } from "../users/_components/UsersWorkspace";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const values = await params;
  await requireAccess(resolveRouteLocale(values.locale), "/users");
  return <UsersWorkspace />;
}

import { requireAccess } from "@/lib/access-server";
import { resolveRouteLocale } from "@/i18n/paths";
import { ContractTemplatesWorkspace } from "./_components/ContractTemplatesWorkspace";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAccess(
    resolveRouteLocale(locale),
    "/company/contract-templates",
    "templates.read",
  );
  return <ContractTemplatesWorkspace />;
}

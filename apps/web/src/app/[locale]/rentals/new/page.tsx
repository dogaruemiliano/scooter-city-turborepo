import { resolveRouteLocale } from "@/i18n/paths";
import { requireAccess } from "@/lib/access-server";
import { RentalCreateWizard } from "../_components/RentalCreateWizard";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: messages[resolveRouteLocale(locale)].workspace.rentals.add };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    draftId?: string | string[];
    personId?: string | string[];
  }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const user = await requireAccess(
    resolveRouteLocale(locale),
    "/rentals/new",
    "rentals.create",
  );
  return (
    <RentalCreateWizard
      key={user.id}
      userId={user.id}
      returnedDraftId={
        typeof query.draftId === "string" ? query.draftId : undefined
      }
      returnedPersonId={
        typeof query.personId === "string" ? query.personId : undefined
      }
    />
  );
}

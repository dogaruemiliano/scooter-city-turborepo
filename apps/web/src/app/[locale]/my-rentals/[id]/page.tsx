import { resolveRouteLocale } from "@/i18n/paths";
import { requireAccess } from "@/lib/access-server";
import { RentalsWorkspace } from "../../rentals/_components/RentalsWorkspace";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireAccess(
    resolveRouteLocale(locale),
    "/my-rentals",
    "portal.rentals.read",
  );
  return <RentalsWorkspace id={id} portal />;
}

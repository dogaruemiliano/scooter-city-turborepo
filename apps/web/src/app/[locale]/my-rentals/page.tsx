import { resolveRouteLocale } from "@/i18n/paths";
import { requireAccess } from "@/lib/access-server";
import { RentalsWorkspace } from "../rentals/_components/RentalsWorkspace";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const values = await params;
  await requireAccess(
    resolveRouteLocale(values.locale),
    "/my-rentals",
    "portal.rentals.read",
  );
  return <RentalsWorkspace portal />;
}

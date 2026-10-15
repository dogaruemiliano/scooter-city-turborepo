import { v1 } from "@repo/api-shared";
import { Badge } from "@repo/ui/components/badge";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function RentalListItem({
  rental,
  portal,
}: {
  rental: v1.rentals.Rental | v1.rentals.CustomerRental;
  portal: boolean;
}) {
  const t = useTranslations("workspace.rentals");
  const locale = useLocale();
  return (
    <article className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link
          href={`${portal ? "/my-rentals" : "/rentals"}/${rental.id}`}
          className="rounded-sm font-medium text-link underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {rental.scooter.brandName} {rental.scooter.model} ·{" "}
          {v1.scooters.scooterDisplayCode(rental.scooter)}
        </Link>
        <Badge variant="secondary">{t(rental.status)}</Badge>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        {!portal && "person" in rental ? (
          <div className="sm:col-span-2">
            <dt className="text-sm text-muted-foreground">{t("person")}</dt>
            <dd className="text-sm">
              {rental.person.firstName} {rental.person.lastName}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-sm text-muted-foreground">{t("startsAt")}</dt>
          <dd className="text-sm">
            <time dateTime={rental.startsAt}>
              {new Date(rental.startsAt).toLocaleString(locale)}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t("endsAt")}</dt>
          <dd className="text-sm">
            <time dateTime={rental.endsAt}>
              {new Date(rental.endsAt).toLocaleString(locale)}
            </time>
          </dd>
        </div>
      </dl>
    </article>
  );
}

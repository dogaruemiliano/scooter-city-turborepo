import { getLocaleFromPathname, localizePath } from "@/i18n/paths";
import { attachRentalPerson } from "../../rentals/_lib/rental-draft";

export function personCreateCancelHref(
  personsHref: string,
  rentalDraftId?: string,
) {
  return rentalDraftId
    ? localizePath("/rentals/new", getLocaleFromPathname(personsHref))
    : personsHref;
}

/** Return destinations are constructed here, never accepted as arbitrary URLs. */
export function personCreateDestination(
  personsHref: string,
  personId: string,
  rentalDraftId?: string,
  userId?: string,
) {
  if (!rentalDraftId) return `${personsHref}/${encodeURIComponent(personId)}`;
  if (userId) {
    try {
      attachRentalPerson(userId, rentalDraftId, personId);
    } catch {
      // The returned ID also travels in the URL so the wizard can retry saving.
    }
  }
  const query = new URLSearchParams({ draftId: rentalDraftId, personId });
  return localizePath(
    `/rentals/new?${query}`,
    getLocaleFromPathname(personsHref),
  );
}

import type { v1 } from "@repo/api-shared";
import {
  BadgeAlertIcon,
  BadgeCheckIcon,
  CarFrontIcon,
  CircleAlertIcon,
  FileTextIcon,
  IdCardIcon,
  type LucideIcon,
} from "lucide-react";

export const inlineIconClassName = "size-4 shrink-0";

export const documentPhotoAccept = "image/jpeg,image/png,image/webp";

export const documentStatusClasses = {
  unverified: "border-warning-subtle text-warning",
  verified: "border-success-subtle text-success",
  rejected: "border-destructive-subtle text-destructive",
  expired: "border-destructive-subtle text-destructive",
} as const satisfies Record<v1.persons.PersonDocumentStatus, string>;

export const documentStatusIcons = {
  unverified: CircleAlertIcon,
  verified: BadgeCheckIcon,
  rejected: BadgeAlertIcon,
  expired: BadgeAlertIcon,
} as const satisfies Record<v1.persons.PersonDocumentStatus, LucideIcon>;

export const documentTypeIcons = {
  passport: IdCardIcon,
  nationalId: IdCardIcon,
  driverLicense: CarFrontIcon,
  residencePermit: IdCardIcon,
  other: FileTextIcon,
} as const satisfies Record<v1.persons.PersonDocumentType, LucideIcon>;

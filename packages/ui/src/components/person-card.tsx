import type { ComponentProps } from "react";
import { CarFrontIcon, IdCardIcon } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import { Card, CardContent } from "./card";
import { PersonRow } from "./person-row";

export type PersonDocumentState =
  | "missing"
  | "valid"
  | "unverified"
  | "expired"
  | "rejected";
export type PersonDocumentIndicator = {
  type: "identity" | "driverLicense";
  label: string;
  state: PersonDocumentState;
};
const documentClasses: Record<PersonDocumentState, string> = {
  missing: "border-border bg-muted text-disabled-foreground",
  valid: "border-success-subtle bg-success-subtle text-success",
  unverified: "border-warning-subtle bg-warning-subtle text-warning",
  expired: "border-destructive-subtle bg-destructive-subtle text-destructive",
  rejected: "border-destructive-subtle bg-destructive-subtle text-destructive",
};
export function PersonDocuments({
  documents,
}: {
  documents: readonly PersonDocumentIndicator[];
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      {documents.map(({ type, label, state }) => {
        const Icon = type === "identity" ? IdCardIcon : CarFrontIcon;
        return (
          <span
            key={type}
            role="img"
            aria-label={label}
            title={label}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-md border",
              documentClasses[state],
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
          </span>
        );
      })}
    </span>
  );
}

/** The same identity composition as picker rows, with a non-interactive surface. */
export function PersonCard({
  className,
  ...props
}: ComponentProps<typeof PersonRow> & {
  className?: string;
}) {
  return (
    <Card size="sm" className={className}>
      <CardContent>
        <PersonRow {...props} />
      </CardContent>
    </Card>
  );
}

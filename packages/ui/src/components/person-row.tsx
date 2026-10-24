import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

/** Shared identity content for assigned people and selectable person rows. */
export function PersonRow({
  name,
  description,
  email,
  avatarUrl,
  action,
  details,
  metadata,
}: {
  name: string;
  description?: ReactNode;
  email?: string;
  avatarUrl?: string;
  action?: ReactNode;
  details?: ReactNode;
  metadata?: ReactNode;
}) {
  return (
    <span
      data-slot="person-row"
      className="flex min-w-0 flex-1 items-center gap-4"
    >
      <span
        data-slot="person-avatar-column"
        className="flex shrink-0 flex-col items-center gap-2"
      >
        <Avatar size="xl">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback>
            {name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")}
          </AvatarFallback>
        </Avatar>
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
        <span className="wrap-anywhere text-base font-semibold">{name}</span>
        {email ? (
          <span className="wrap-anywhere text-sm font-normal text-muted-foreground">
            {email}
          </span>
        ) : null}
        {description ? (
          <span className="wrap-anywhere text-sm text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {action || details || metadata ? (
        <span
          data-slot="person-trailing"
          className="flex shrink-0 flex-col items-end justify-between gap-2 self-stretch"
        >
          {metadata || action ? (
            <span className="flex flex-col items-end gap-2">
              {metadata ? (
                <span
                  data-slot="person-metadata"
                  className="flex flex-col items-end gap-1 text-right text-xs text-muted-foreground"
                >
                  {metadata}
                </span>
              ) : null}
              {action ? (
                <span data-slot="person-action" className="flex justify-end">
                  {action}
                </span>
              ) : null}
            </span>
          ) : null}
          {details ? (
            <span
              data-slot="person-details"
              className="mt-auto flex justify-end"
            >
              {details}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

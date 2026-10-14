import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

/** Shared identity content for assigned people and selectable person rows. */
export function PersonRow({
  name,
  description,
  avatarUrl,
  action,
}: {
  name: string;
  description?: string;
  avatarUrl?: string;
  action?: ReactNode;
}) {
  return (
    <span
      data-slot="person-row"
      className="flex min-w-0 flex-1 items-center gap-4"
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
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="wrap-anywhere text-base font-semibold">{name}</span>
        {description ? (
          <span className="wrap-anywhere text-sm text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {action}
    </span>
  );
}

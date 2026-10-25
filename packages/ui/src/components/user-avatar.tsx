"use client";

import type { ComponentProps } from "react";
import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

function UserAvatar({
  src,
  name,
  ...props
}: ComponentProps<typeof Avatar> & { src?: string; name?: string }) {
  const initials = name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();
  return (
    <Avatar {...props}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback>
        {initials || (
          <UserRound className="size-5 group-data-[size=sm]/avatar:size-4 group-data-[size=xl]/avatar:size-6 group-data-[size=profile]/avatar:size-12" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}

export { UserAvatar };

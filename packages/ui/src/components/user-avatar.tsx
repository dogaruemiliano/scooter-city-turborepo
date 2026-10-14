"use client";

import type { ComponentProps } from "react";
import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "./avatar";

function UserAvatar(props: ComponentProps<typeof Avatar>) {
  return (
    <Avatar {...props}>
      <AvatarFallback>
        <UserRound className="size-5 group-data-[size=sm]/avatar:size-4 group-data-[size=xl]/avatar:size-6" />
      </AvatarFallback>
    </Avatar>
  );
}

export { UserAvatar };

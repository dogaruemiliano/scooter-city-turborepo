"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components";
import { EllipsisVerticalIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { PageHeaderActions } from "@/components/PageHeaderActions";
import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

export type MoreActionsItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
  permission?: string;
};

export function MoreActionsMenu({
  ariaLabel,
  groups,
}: {
  ariaLabel: string;
  groups: MoreActionsItem[][];
}) {
  const session = useOptionalSession();
  const visibleGroups = groups
    .map((group) =>
      group.filter(
        (item) => !item.permission || canAccess(session?.user, item.permission),
      ),
    )
    .filter((group) => group.length > 0);
  if (visibleGroups.length === 0) return null;
  return (
    <PageHeaderActions>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button aria-label={ariaLabel} variant="ghost" size="icon" />}
        >
          <EllipsisVerticalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-48">
          {visibleGroups.map((group, index) => (
            <Fragment key={group.map((item) => item.key).join("-")}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuGroup>
                {group.map((item) => (
                  <DropdownMenuItem
                    key={item.key}
                    variant={item.variant}
                    disabled={item.disabled}
                    onClick={item.onClick}
                  >
                    {item.icon}
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </PageHeaderActions>
  );
}

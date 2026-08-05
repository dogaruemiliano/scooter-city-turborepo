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

export type MoreActionsItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
};

export function MoreActionsMenu({
  ariaLabel,
  groups,
}: {
  ariaLabel: string;
  groups: MoreActionsItem[][];
}) {
  return (
    <PageHeaderActions>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button aria-label={ariaLabel} variant="ghost" size="icon" />}
        >
          <EllipsisVerticalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-48">
          {groups.map((group, index) => (
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

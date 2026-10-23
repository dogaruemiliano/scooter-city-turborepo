"use client";

import type { ReactNode } from "react";
import { ShieldCheck, ShieldOff, UserRound, Wrench } from "lucide-react";
import { Card } from "@repo/ui/components/card";
import { roleColors } from "../_lib/role-colors";

/** Shared surface for role cards, picker rows, and the selected-role trigger. */
export const roleCardSurface =
  "h-auto rounded-xl border border-border bg-card p-4 text-left md:h-auto md:p-4";

export function RoleCard({
  title,
  description,
  slug,
  contentOnly = false,
  trailing,
  footer,
}: {
  title: string;
  description: string;
  slug: string;
  contentOnly?: boolean;
  trailing?: ReactNode;
  footer?: ReactNode;
}) {
  const colors = roleColors[slug] ?? roleColors.none;
  const Icon =
    slug === "mechanic"
      ? Wrench
      : slug === "customer"
        ? UserRound
        : slug === "none"
          ? ShieldOff
          : ShieldCheck;
  const Title = contentOnly ? "span" : "h3";
  const Content = contentOnly ? "span" : "div";
  const content = (
    <Content
      data-slot="role-card-content"
      className="flex min-w-0 flex-1 items-center gap-3"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <Content className="flex min-w-0 flex-1 flex-col gap-1">
        <Title className={`font-sans text-sm font-semibold ${colors.title}`}>
          {title}
        </Title>
        <span className="text-sm font-normal leading-snug text-muted-foreground">
          {description}
        </span>
      </Content>
      {trailing}
    </Content>
  );
  if (contentOnly) return content;
  return (
    <Card as="article" className={`gap-4 ${roleCardSurface}`}>
      {content}
      {footer ? (
        <div className="mt-auto border-t border-border pt-4">{footer}</div>
      ) : null}
    </Card>
  );
}

"use client";

import { userAvatarSrc } from "@/lib/user-avatar";
import type { ComponentProps, ReactNode } from "react";
import { UserCard } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useSession } from "@/components/auth/SessionProvider";
import { roleColors } from "../../roles/_lib/role-colors";
import type { AssigneeOption } from "./AssigneeSelect";

export function AssigneeUserCard({
  member,
  name,
  action,
  showEmail = true,
}: {
  member?: AssigneeOption;
  name: string;
  action?: ReactNode;
  showEmail?: boolean;
}) {
  const t = useTranslations("workspace");
  const { user } = useSession();
  const designation = member?.id === user?.id ? "superAdmin" : "admin";
  const roles = member?.isSuperAdmin
    ? [
        {
          label: t(`access.member.roleNames.${designation}`),
          slug: designation,
        },
      ]
    : (member?.roles ?? []).map((role) => ({
        label: role,
        slug: role.trim().toLowerCase(),
      }));
  return (
    <UserCard
      name={name}
      avatarUrl={userAvatarSrc(member?.avatarAssetId)}
      email={showEmail ? member?.email : undefined}
      roles={roles.map((role) => ({
        label: role.label,
        colorClassName: (roleColors[role.slug] ?? roleColors.none).title,
      }))}
      action={action}
    />
  );
}

/** The selected-user surface shared by create and problem detail screens. */
export function AssigneeUserRow(
  props: ComponentProps<typeof AssigneeUserCard>,
) {
  return (
    <div
      data-slot="assignee-user-row"
      className="flex items-center rounded-2xl border border-border bg-card p-4 text-card-foreground"
    >
      <AssigneeUserCard {...props} />
    </div>
  );
}

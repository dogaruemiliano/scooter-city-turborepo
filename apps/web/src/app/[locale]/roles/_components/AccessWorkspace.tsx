"use client";

import type { MouseEvent, ReactNode } from "react";
import { Users, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageTitleOverride } from "@/components/PageTitleOverride";

export function AccessWorkspace({
  children,
  current,
  onNavigate,
  editor = false,
  hideTitle = false,
  hideTabs = false,
}: {
  children: ReactNode;
  current: "directory" | "roles";
  editor?: boolean;
  hideTitle?: boolean;
  hideTabs?: boolean;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const t = useTranslations("workspace.access.member");
  return (
    <main className="access-workspace flex min-h-full min-w-0 flex-1 flex-col gap-6 bg-background p-4 font-body text-foreground md:p-8">
      <PageTitleOverride
        title={
          editor ? "" : t(current === "roles" ? "rolesPageTitle" : "title")
        }
      />
      {!editor ? (
        <>
          {!hideTabs ? (
            <nav aria-label={t("navigation")} className="flex gap-6 border-b">
              {[
                { key: "directory", href: "/users", icon: Users },
                { key: "roles", href: "/roles", icon: ShieldCheck },
              ].map(({ key, href, icon: Icon }) => (
                <Link
                  key={key}
                  href={href}
                  onClick={(event) => onNavigate?.(event, href)}
                  aria-current={current === key ? "page" : undefined}
                  className={`inline-flex min-h-12 items-center gap-2 border-b-2 pb-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring ${current === key ? "border-primary text-link" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {t(key)}
                </Link>
              ))}
            </nav>
          ) : null}
          {!hideTitle ? (
            <header className="flex flex-col gap-2">
              <h1 className="text-balance font-sans text-2xl font-bold tracking-tight md:text-3xl">
                {t("title")}
              </h1>
              <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
            </header>
          ) : null}
        </>
      ) : null}
      {children}
    </main>
  );
}

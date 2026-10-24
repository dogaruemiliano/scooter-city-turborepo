"use client";
import { useCallback } from "react";
import { v1 } from "@repo/api-shared";
import { Badge, Button, buttonVariants } from "@repo/ui/components";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import {
  Feedback,
  RemoteState,
  useRemote,
  useTask,
} from "@/components/WorkspaceForm";
export function PersonAppAccess({ personId }: { personId: string }) {
  const locale = resolveRouteLocale(useLocale());
  const t = useTranslations("workspace");
  const task = useTask();
  const load = useCallback(
    () =>
      webApi.fetch(
        `/v1/persons/${personId}/app-access`,
        v1.access.accessUserSchema,
        { cache: "no-store" },
      ),
    [personId],
  );
  const remote = useRemote(load);
  return (
    <section className="flex flex-col items-start gap-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">{t("access.accountAccess")}</h2>
      <p className="text-sm text-muted-foreground">
        {t("access.customerHelp")} {t("access.completeSetup")}
      </p>
      {!remote.data ? (
        <RemoteState error={remote.error} retry={remote.reload} />
      ) : (
        <>
          <p>{remote.data.email}</p>
          <Badge variant="secondary">
            {t(`access.${remote.data.loginStatus.toLowerCase()}`)}
          </Badge>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={task.busy}
              onClick={() =>
                void task.run(async () => {
                  if (!remote.data) return;
                  await webApi.fetch(
                    `/v1/persons/${personId}/app-access`,
                    v1.access.accessUserSchema,
                    {
                      method: "PUT",
                      json: {
                        expectedRevision: remote.data.accessRevision,
                        enabled: !remote.data.portalEligible,
                      },
                    },
                  );
                  remote.reload();
                })
              }
            >
              {remote.data.portalEligible
                ? t("access.disableCustomer")
                : t("access.enableCustomer")}
            </Button>
            <Link
              href={localizePath(`/users/${remote.data.id}`, locale)}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("access.manageAccess")}
            </Link>
          </div>
        </>
      )}
      <Feedback error={task.error} />
    </section>
  );
}

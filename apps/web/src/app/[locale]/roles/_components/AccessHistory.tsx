"use client";
import { useCallback } from "react";
import { ListItems, ListEmpty } from "@repo/ui/components/list";
import { v1 } from "@repo/api-shared";
import { useLocale, useTranslations } from "next-intl";
import { webApi } from "@/lib/api";
import { RemoteState, useRemote } from "@/components/WorkspaceForm";
export function AccessHistory({ path }: { path: string }) {
  const t = useTranslations("workspace");
  const locale = useLocale();
  const load = useCallback(
    () =>
      webApi.fetch(path, v1.access.accessAuditListSchema, {
        cache: "no-store",
      }),
    [path],
  );
  const remote = useRemote(load);
  return (
    <section className="flex flex-col gap-4 border-t pt-6">
      <h2 className="text-lg font-semibold">{t("access.audit")}</h2>
      {!remote.data ? (
        <RemoteState error={remote.error} retry={remote.reload} />
      ) : (
        <ListItems
          ordered
          items={remote.data.items}
          getItemKey={(event) => event.id}
          empty={<ListEmpty>{t("access.noAudit")}</ListEmpty>}
          renderItem={(event) => (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap justify-between gap-3">
                <span className="font-medium">
                  {event.type.replaceAll("_", " ").toLowerCase()}
                </span>
                <time
                  className="text-sm text-muted-foreground"
                  dateTime={event.createdAt}
                >
                  {new Date(event.createdAt).toLocaleString(locale)}
                </time>
              </div>
              <details>
                <summary className="cursor-pointer text-sm">
                  {t("access.changeDetails")}
                </summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
                  {JSON.stringify(event.meta, null, 2)}
                </pre>
              </details>
            </div>
          )}
        />
      )}
    </section>
  );
}

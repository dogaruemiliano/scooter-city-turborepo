"use client";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";
import { useCallback, useState } from "react";
import { v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  Field,
  FieldLabel,
  ListEmpty,
  ListFilterSheet,
  ListItems,
  ListLayout,
  ListPagination,
  ListStatus,
  SheetSelect,
} from "@repo/ui/components";
import { useFormatter, useTranslations } from "next-intl";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { useSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import {
  Feedback,
  RemoteState,
  useRemote,
  useTask,
  WorkspacePage,
} from "@/components/WorkspaceForm";
import { RentalCreateAction } from "./RentalCreateAction";
import { RentalPersonCard, RentalPersonsProvider } from "./RentalPersonCard";
import { RentalListItem } from "./RentalListItem";
import { RentalCheckout } from "./RentalCheckout";

type Rental = v1.rentals.Rental | v1.rentals.CustomerRental;
type RentalList = {
  items: Rental[];
  total: number;
  page: number;
  pageSize: number;
};
export function RentalsWorkspace(props: { portal?: boolean; id?: string }) {
  return (
    <RentalPersonsProvider enabled={!props.portal}>
      <RentalsWorkspaceContent {...props} />
    </RentalPersonsProvider>
  );
}
function RentalsWorkspaceContent({
  portal = false,
  id,
}: {
  portal?: boolean;
  id?: string;
}) {
  const t = useTranslations("workspace");
  const shared = useTranslations("shared");
  const { user } = useSession();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Rental["status"] | "">("");
  const endpoint = portal ? "/v1/portal/rentals" : "/v1/rentals";
  const load = useCallback(async (): Promise<RentalList> => {
    if (id) {
      const item = portal
        ? await webApi.fetch(
            `${endpoint}/${id}`,
            v1.rentals.customerRentalSchema,
            { cache: "no-store" },
          )
        : await webApi.fetch(`${endpoint}/${id}`, v1.rentals.rentalSchema, {
            cache: "no-store",
          });
      return { items: [item], total: 1, page: 1, pageSize: 1 };
    }
    const query = new URLSearchParams({ page: String(page) });
    if (status) query.set("status", status);
    return portal
      ? webApi.fetch(
          `${endpoint}?${query}`,
          v1.rentals.customerRentalListSchema,
          { cache: "no-store" },
        )
      : webApi.fetch(`${endpoint}?${query}`, v1.rentals.rentalListSchema, {
          cache: "no-store",
        });
  }, [endpoint, id, page, portal, status]);
  const remote = useRemote(load);
  return (
    <WorkspacePage
      title={
        id
          ? t("rentals.details")
          : portal
            ? t("rentals.myTitle")
            : t("rentals.title")
      }
      description={
        portal ? t("rentals.myDescription") : t("rentals.description")
      }
    >
      {id ? (
        <>
          <Link href={portal ? "/my-rentals" : "/rentals"}>{t("back")}</Link>
          {!remote.data ? (
            <RemoteState error={remote.error} retry={remote.reload} />
          ) : remote.data.items[0] ? (
            <RentalDetail
              key={`${id}-${remote.data.items[0].revision}`}
              rental={remote.data.items[0]}
              portal={portal}
              reload={remote.reload}
            />
          ) : (
            <ListEmpty>{t("empty")}</ListEmpty>
          )}
        </>
      ) : (
        <ListLayout
          summary={
            remote.data && (remote.loading || remote.error)
              ? shared("list.staleResults")
              : undefined
          }
          filters={
            <ListFilterSheet<{ status: Rental["status"] | "" }>
              value={{ status }}
              defaultValue={{ status: "" }}
              onApply={(value) => {
                setStatus(value.status);
                setPage(1);
              }}
              appliedCount={Number(Boolean(status))}
              title={shared("list.filters")}
              applyLabel={shared("list.apply")}
              applyingLabel={shared("list.applying")}
              resetLabel={shared("list.reset")}
              cancelLabel={shared("actions.cancel")}
              applyErrorLabel={shared("list.applyError")}
            >
              {({ value, setValue }) => (
                <Field>
                  <FieldLabel htmlFor="rental-status-filter">
                    {t("status")}
                  </FieldLabel>
                  <SheetSelect
                    id="rental-status-filter"
                    label={t("status")}
                    value={value.status}
                    placeholder={shared("list.all")}
                    onValueChange={(status) =>
                      setValue({
                        status: v1.rentals.rentalStatusSchema.parse(status),
                      })
                    }
                    options={v1.rentals.rentalStatusSchema.options.map(
                      (status) => ({
                        value: status,
                        label: t(`rentals.${status}`),
                      }),
                    )}
                    onClear={() => setValue({ status: "" })}
                    clearOptionLabel={shared("list.all")}
                    searchPlaceholder={shared("list.selectSearch")}
                    clearSearchLabel={shared("list.selectClearSearch")}
                    emptyMessage={shared("list.selectEmpty")}
                    closeLabel={shared("actions.close")}
                  />
                </Field>
              )}
            </ListFilterSheet>
          }
          action={
            !portal && canAccess(user, "rentals.create") ? (
              <RentalCreateAction userId={user!.id} />
            ) : undefined
          }
          footer={
            remote.data ? (
              <ListPagination
                canPrevious={!remote.loading && page > 1}
                canNext={
                  !remote.loading &&
                  page * remote.data.pageSize < remote.data.total
                }
                onPrevious={() => setPage((value) => value - 1)}
                onNext={() => setPage((value) => value + 1)}
                label={shared("list.pagination")}
                previousLabel={t("previous")}
                nextLabel={t("next")}
              />
            ) : undefined
          }
        >
          <ListStatus
            initial={!remote.data}
            loading={remote.loading}
            error={remote.error}
            loadingLabel={shared(
              remote.data ? "status.refreshing" : "status.loading",
            )}
            retryLabel={t("retry")}
            onRetry={remote.reload}
          />
          {remote.data ? (
            <ListItems
              items={remote.data.items}
              getItemKey={(rental) => rental.id}
              empty={
                <ListEmpty>
                  {status ? shared("list.noResults") : t("empty")}
                </ListEmpty>
              }
              renderItem={(rental) => (
                <RentalListItem rental={rental} portal={portal} />
              )}
            />
          ) : null}
        </ListLayout>
      )}
    </WorkspacePage>
  );
}
function RentalDetail({
  rental,
  portal,
  reload,
}: {
  rental: Rental;
  portal: boolean;
  reload: () => void;
}) {
  const formAction = useFormAction();

  const t = useTranslations("workspace");
  const format = useFormatter();
  const { user } = useSession();
  const task = useTask({
    [v1.problems.MAINTENANCE_HOLD_ERROR_CODE]: t("rentals.maintenanceHold"),
  });
  const [confirm, setConfirm] = useState<string | null>(null);
  async function transition(action: string) {
    await webApi.fetch(
      `/v1/rentals/${rental.id}/${action}`,
      v1.rentals.rentalSchema,
      { method: "POST", json: { revision: rental.revision } },
    );
    reload();
  }
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">
          {rental.scooter.brandName} {rental.scooter.model} ·{" "}
          {v1.scooters.scooterDisplayCode(rental.scooter)}
        </h2>
        <Badge variant="secondary">{t(`rentals.${rental.status}`)}</Badge>
      </header>
      <dl className="grid gap-4 sm:grid-cols-2">
        {!portal && "person" in rental ? (
          <div>
            <dt className="text-sm text-muted-foreground">
              {t("rentals.person")}
            </dt>
            <dd>
              <RentalPersonCard person={rental.person} contacts />
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-sm text-muted-foreground">
            {t("rentals.startsAt")}
          </dt>
          <dd>
            {format.dateTime(new Date(rental.startsAt), {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: v1.rentals.RENTAL_POLICY.timezone,
            })}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            {t("rentals.endsAt")}
          </dt>
          <dd>
            {format.dateTime(new Date(rental.endsAt), {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: v1.rentals.RENTAL_POLICY.timezone,
            })}
          </dd>
        </div>
      </dl>
      {rental.customerNotes ? (
        <section>
          <h3 className="font-medium">{t("rentals.customerNotes")}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {rental.customerNotes}
          </p>
        </section>
      ) : null}
      {!portal && "internalNotes" in rental && rental.internalNotes ? (
        <section>
          <h3 className="font-medium">{t("rentals.internalNotes")}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {rental.internalNotes}
          </p>
        </section>
      ) : null}
      {!portal && "person" in rental ? (
        <RentalCheckout rental={rental} onChanged={reload} />
      ) : null}
      {!portal ? (
        <>
          <div className="flex flex-wrap gap-3">
            {rental.status === "reserved" &&
            rental.workflowVersion !== 1 &&
            canAccess(user, "rentals.handover") ? (
              <Button onClick={() => setConfirm("handover")}>
                {t("rentals.handover")}
              </Button>
            ) : null}
            {rental.status === "active" && canAccess(user, "rentals.return") ? (
              <Button onClick={() => setConfirm("return")}>
                {t("rentals.return")}
              </Button>
            ) : null}
            {rental.status === "reserved" &&
            canAccess(user, "rentals.create") ? (
              <Button variant="outline" onClick={() => setConfirm("cancel")}>
                {t("rentals.cancel")}
              </Button>
            ) : null}
          </div>
          {confirm ? (
            <div className="flex gap-3">
              <SaveButton
                disabled={task.busy}
                onClick={() => void task.run(() => transition(confirm))}
                {...formAction(
                  "confirm",
                  { pending: task.busy, error: task.error },
                  t("access.confirm"),
                )}
              />
              <Button variant="outline" onClick={() => setConfirm(null)}>
                {t("cancel")}
              </Button>
            </div>
          ) : null}
          <Feedback error={task.error} />
        </>
      ) : null}
      {portal &&
      canAccess(user, "portal.scooter_documents.read") &&
      rental.status === "active" ? (
        <CustomerDocuments rentalId={rental.id} />
      ) : null}
      {!portal && canAccess(user, "scooter_documents.read") ? (
        <PublicationDocuments scooterId={rental.scooterId} />
      ) : null}
    </div>
  );
}
function CustomerDocuments({ rentalId }: { rentalId: string }) {
  const t = useTranslations("workspace");
  const load = useCallback(
    () =>
      webApi.fetch(
        `/v1/portal/rentals/${rentalId}/scooter-documents`,
        v1.rentals.customerDocumentListSchema,
        { cache: "no-store" },
      ),
    [rentalId],
  );
  const remote = useRemote(load);
  const task = useTask();
  return (
    <section className="flex flex-col gap-3 border-t pt-6">
      <h2 className="text-lg font-semibold">{t("rentals.documents")}</h2>
      {!remote.data ? (
        <RemoteState error={remote.error} retry={remote.reload} />
      ) : (
        <ListItems
          items={remote.data.items}
          getItemKey={(document) => document.id}
          empty={<ListEmpty>{t("rentals.noDocuments")}</ListEmpty>}
          renderItem={(document) => (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{document.fileName}</span>
              <Button
                variant="outline"
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    // Refresh the authenticated session before requesting private binary content.
                    await webApi.fetch(
                      v1.auth.ROUTES.me,
                      v1.auth.sessionUserSchema,
                      { cache: "no-store" },
                    );
                    const response = await fetch(
                      webApi.url(
                        `/v1/portal/rentals/${rentalId}/scooter-documents/${document.id}/content`,
                      ),
                      { credentials: "include", cache: "no-store" },
                    );
                    if (!response.ok) throw new Error(t("error"));
                    const url = URL.createObjectURL(await response.blob());
                    const anchor = window.document.createElement("a");
                    anchor.href = url;
                    anchor.download = document.fileName;
                    anchor.click();
                    window.setTimeout(() => URL.revokeObjectURL(url), 0);
                  })
                }
              >
                {t("rentals.download")}
              </Button>
            </div>
          )}
        />
      )}
      <Feedback error={task.error} />
    </section>
  );
}
const publicationListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      fileName: z.string(),
      customerVisible: z.boolean(),
    }),
  ),
});
function PublicationDocuments({ scooterId }: { scooterId: string }) {
  const t = useTranslations("workspace");
  const { user } = useSession();
  const load = useCallback(
    () =>
      webApi.fetch(
        `/v1/rentals/scooters/${scooterId}/documents`,
        publicationListSchema,
        { cache: "no-store" },
      ),
    [scooterId],
  );
  const remote = useRemote(load);
  const task = useTask();
  return (
    <section className="flex flex-col gap-3 border-t pt-6">
      <h2 className="text-lg font-semibold">{t("rentals.documents")}</h2>
      {!remote.data ? (
        <RemoteState error={remote.error} retry={remote.reload} />
      ) : (
        <ListItems
          items={remote.data.items}
          getItemKey={(document) => document.id}
          empty={<ListEmpty>{t("rentals.noDocuments")}</ListEmpty>}
          renderItem={(document) => (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p>{document.fileName}</p>
                {document.customerVisible ? (
                  <Badge variant="secondary">
                    {t("rentals.customerVisible")}
                  </Badge>
                ) : null}
              </div>
              {canAccess(user, "scooter_documents.write") ? (
                <Button
                  variant="outline"
                  disabled={task.busy}
                  onClick={() =>
                    void task.run(async () => {
                      await webApi.fetch(
                        `/v1/rentals/scooter-documents/${document.id}/visibility`,
                        z.object({
                          id: z.string(),
                          customerVisible: z.boolean(),
                        }),
                        {
                          method: "PATCH",
                          json: { customerVisible: !document.customerVisible },
                        },
                      );
                      remote.reload();
                    })
                  }
                >
                  {document.customerVisible
                    ? t("rentals.unpublish")
                    : t("rentals.publish")}
                </Button>
              ) : null}
            </div>
          )}
        />
      )}
      <Feedback error={task.error} />
    </section>
  );
}

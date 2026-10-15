"use client";
import { useCallback, useState } from "react";
import { v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
  ListEmpty,
  ListFilterSheet,
  ListItems,
  ListLayout,
  ListPagination,
  ListStatus,
  SheetSelect,
} from "@repo/ui/components";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { Link, useRouter } from "@/i18n/navigation";
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
import { EntityPicker } from "@/components/EntityPicker";
import { RentalListItem } from "./RentalListItem";

type Rental = v1.rentals.Rental | v1.rentals.CustomerRental;
type RentalList = {
  items: Rental[];
  total: number;
  page: number;
  pageSize: number;
};
export function RentalsWorkspace({
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
  const [creating, setCreating] = useState(false);
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
              <Button onClick={() => setCreating(!creating)}>
                {creating ? t("cancel") : t("rentals.add")}
              </Button>
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
          {creating ? (
            <CreateRental
              onSaved={() => {
                setCreating(false);
                remote.reload();
              }}
            />
          ) : null}
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
function CreateRental({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("workspace");
  const task = useTask({
    [v1.problems.MAINTENANCE_HOLD_ERROR_CODE]: t("rentals.maintenanceHold"),
  });
  const router = useRouter();
  const [personId, setPerson] = useState("");
  const [scooterId, setScooter] = useState("");
  const [startsAt, setStarts] = useState("");
  const [endsAt, setEnds] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  return (
    <form
      className="flex flex-col gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void task.run(async () => {
          const json = v1.rentals.createRentalInputSchema.parse({
            personId,
            scooterId,
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            customerNotes,
            internalNotes,
          });
          const rental = await webApi.fetch(
            "/v1/rentals",
            v1.rentals.rentalSchema,
            { method: "POST", json },
          );
          onSaved();
          router.push(`/rentals/${rental.id}`);
        });
      }}
    >
      <EntityPicker
        kind="persons"
        label={t("rentals.person")}
        value={personId}
        onChange={setPerson}
      />
      <EntityPicker
        kind="scooters"
        label={t("rentals.scooter")}
        value={scooterId}
        onChange={setScooter}
      />
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="rental-start">
              {t("rentals.startsAt")}
            </FieldLabel>
            <Input
              id="rental-start"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(event) => setStarts(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="rental-end">{t("rentals.endsAt")}</FieldLabel>
            <Input
              id="rental-end"
              type="datetime-local"
              min={startsAt}
              required
              value={endsAt}
              onChange={(event) => setEnds(event.target.value)}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="customer-notes">
            {t("rentals.customerNotes")}
          </FieldLabel>
          <Textarea
            id="customer-notes"
            value={customerNotes}
            onChange={(event) => setCustomerNotes(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="internal-notes">
            {t("rentals.internalNotes")}
          </FieldLabel>
          <Textarea
            id="internal-notes"
            value={internalNotes}
            onChange={(event) => setInternalNotes(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <Feedback error={task.error} />
      <Button
        type="submit"
        className="self-start"
        disabled={task.busy || !personId || !scooterId}
      >
        {t("rentals.add")}
      </Button>
    </form>
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
  const t = useTranslations("workspace");
  const locale = useLocale();
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
              {rental.person.firstName} {rental.person.lastName}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-sm text-muted-foreground">
            {t("rentals.startsAt")}
          </dt>
          <dd>{new Date(rental.startsAt).toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            {t("rentals.endsAt")}
          </dt>
          <dd>{new Date(rental.endsAt).toLocaleString(locale)}</dd>
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
      {!portal ? (
        <>
          <div className="flex flex-wrap gap-3">
            {rental.status === "reserved" &&
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
              <Button
                disabled={task.busy}
                onClick={() => void task.run(() => transition(confirm))}
              >
                {t("access.confirm")}
              </Button>
              <Button variant="outline" onClick={() => setConfirm(null)}>
                {t("cancel")}
              </Button>
            </div>
          ) : null}
          <Feedback error={task.error} success={task.success} />
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
      <Feedback error={task.error} success={task.success} />
    </section>
  );
}

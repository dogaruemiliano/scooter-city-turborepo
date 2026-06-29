"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  buttonVariants,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  ArrowLeftIcon,
  BadgeAlertIcon,
  BadgeCheckIcon,
  CalendarDaysIcon,
  CarFrontIcon,
  CircleAlertIcon,
  EllipsisIcon,
  FileTextIcon,
  ImageIcon,
  IdCardIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { webApi } from "@/lib/api";

interface PersonDetailPageProps {
  person: v1.persons.Person;
  auditEvents: v1.persons.PersonAuditEvent[];
  documentPhotos: DocumentPhotosByDocumentId;
  personsHref: string;
}

interface Feedback {
  kind: "error" | "success";
  title: string;
  messages: string[];
}

type PersonsTranslations = ReturnType<typeof useTranslations>;

type ReadinessIssue =
  | "missingIdentity"
  | "missingDriverLicense"
  | "hasRejected"
  | "hasExpired"
  | "hasUnverified";

type DocumentPhotosByDocumentId = Record<
  string,
  v1.persons.PersonDocumentPhoto[]
>;

const inlineIconClassName = "size-4 shrink-0";
const documentPhotoAccept = "image/jpeg,image/png,image/webp";
const documentStatusClasses = {
  unverified: "border-warning-subtle text-warning",
  verified: "border-success-subtle text-success",
  rejected: "border-destructive-subtle text-destructive",
  expired: "border-destructive-subtle text-destructive",
} as const satisfies Record<v1.persons.PersonDocumentStatus, string>;
const documentStatusIcons = {
  unverified: CircleAlertIcon,
  verified: BadgeCheckIcon,
  rejected: BadgeAlertIcon,
  expired: BadgeAlertIcon,
} as const satisfies Record<v1.persons.PersonDocumentStatus, LucideIcon>;
const documentTypeIcons = {
  passport: IdCardIcon,
  nationalId: IdCardIcon,
  driverLicense: CarFrontIcon,
  residencePermit: IdCardIcon,
  other: FileTextIcon,
} as const satisfies Record<v1.persons.PersonDocumentType, LucideIcon>;

export function PersonDetailPage({
  person,
  auditEvents,
  documentPhotos,
  personsHref,
}: PersonDetailPageProps) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const router = useRouter();
  const fullName = `${person.firstName} ${person.lastName}`;
  const readiness = getRentalReadiness(person);
  const readinessIsReady = readiness.issues.length === 0;
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [deletePersonOpen, setDeletePersonOpen] = useState(false);
  const [photosByDocumentId, setPhotosByDocumentId] =
    useState<DocumentPhotosByDocumentId>(() => documentPhotos);

  async function updatePerson(
    input: v1.persons.UpdatePersonInput,
  ): Promise<boolean> {
    setFeedback(null);
    setBusyAction("person:update");
    try {
      await webApi.fetch(
        v1.persons.ROUTES.update(person.id),
        v1.persons.personSchema,
        { method: "PATCH", json: input },
      );
      setFeedback({
        kind: "success",
        title: t("feedback.updateSuccessTitle"),
        messages: [t("feedback.updateSuccessMessage")],
      });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback(
        apiErrorFeedback(
          error,
          t("feedback.updateErrorTitle"),
          t("feedback.genericError"),
        ),
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function deletePerson(): Promise<boolean> {
    setFeedback(null);
    setBusyAction("person:delete");
    try {
      await webApi.fetch(
        v1.persons.ROUTES.delete(person.id),
        v1.common.noContentSchema,
        {
          method: "DELETE",
        },
      );
      router.replace(personsHref);
      router.refresh();
      return true;
    } catch (error) {
      setFeedback(
        apiErrorFeedback(
          error,
          t("feedback.deleteErrorTitle"),
          t("feedback.genericError"),
        ),
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function createDocument(
    input: v1.persons.CreatePersonDocumentInput,
  ): Promise<boolean> {
    setFeedback(null);
    setBusyAction("document:create");
    try {
      await webApi.fetch(
        v1.persons.ROUTES.documents.create(person.id),
        v1.persons.personDocumentSchema,
        { method: "POST", json: input },
      );
      setFeedback({
        kind: "success",
        title: t("feedback.documentSuccessTitle"),
        messages: [t("feedback.documentSuccessMessage")],
      });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback(
        apiErrorFeedback(
          error,
          t("feedback.updateErrorTitle"),
          t("feedback.genericError"),
        ),
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function updateDocument(
    documentId: string,
    input: v1.persons.UpdatePersonDocumentInput,
  ): Promise<boolean> {
    setFeedback(null);
    setBusyAction(`document:update:${documentId}`);
    try {
      await webApi.fetch(
        v1.persons.ROUTES.documents.update(person.id, documentId),
        v1.persons.personDocumentSchema,
        { method: "PATCH", json: input },
      );
      setFeedback({
        kind: "success",
        title: t("feedback.documentSuccessTitle"),
        messages: [t("feedback.documentSuccessMessage")],
      });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback(
        apiErrorFeedback(
          error,
          t("feedback.updateErrorTitle"),
          t("feedback.genericError"),
        ),
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function replaceDocument(
    documentId: string,
    input: v1.persons.CreatePersonDocumentInput,
  ): Promise<boolean> {
    setFeedback(null);
    setBusyAction(`document:replace:${documentId}`);
    try {
      await webApi.fetch(
        v1.persons.ROUTES.documents.replace(person.id, documentId),
        v1.persons.personDocumentSchema,
        { method: "POST", json: input },
      );
      setFeedback({
        kind: "success",
        title: t("feedback.documentSuccessTitle"),
        messages: [t("feedback.documentSuccessMessage")],
      });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback(
        apiErrorFeedback(
          error,
          t("feedback.updateErrorTitle"),
          t("feedback.genericError"),
        ),
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteDocument(documentId: string): Promise<boolean> {
    setFeedback(null);
    setBusyAction(`document:delete:${documentId}`);
    try {
      await webApi.fetch(
        v1.persons.ROUTES.documents.delete(person.id, documentId),
        v1.common.noContentSchema,
        { method: "DELETE" },
      );
      setFeedback({
        kind: "success",
        title: t("feedback.deleteSuccessTitle"),
        messages: [t("feedback.documentSuccessMessage")],
      });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback(
        apiErrorFeedback(
          error,
          t("feedback.deleteErrorTitle"),
          t("feedback.genericError"),
        ),
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function uploadDocumentPhoto(
    documentId: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File,
  ): Promise<boolean> {
    setFeedback(null);
    setBusyAction(`document-photo:upload:${documentId}:${slot}`);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const photo = await webApi.fetch(
        v1.persons.ROUTES.documents.photos.upsert(person.id, documentId, slot),
        v1.persons.personDocumentPhotoSchema,
        { method: "PUT", body: formData },
      );

      setPhotosByDocumentId((current) =>
        upsertDocumentPhoto(current, documentId, photo),
      );
      setFeedback({
        kind: "success",
        title: t("feedback.documentPhotoSuccessTitle"),
        messages: [t("feedback.documentPhotoSuccessMessage")],
      });
      return true;
    } catch (error) {
      setFeedback(
        apiErrorFeedback(
          error,
          t("feedback.updateErrorTitle"),
          t("feedback.genericError"),
        ),
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteDocumentPhoto(
    documentId: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
  ): Promise<boolean> {
    setFeedback(null);
    setBusyAction(`document-photo:delete:${documentId}:${slot}`);
    try {
      await webApi.fetch(
        v1.persons.ROUTES.documents.photos.delete(person.id, documentId, slot),
        v1.common.noContentSchema,
        { method: "DELETE" },
      );

      setPhotosByDocumentId((current) =>
        removeDocumentPhoto(current, documentId, slot),
      );
      setFeedback({
        kind: "success",
        title: t("feedback.deleteSuccessTitle"),
        messages: [t("feedback.documentPhotoDeletedMessage")],
      });
      return true;
    } catch (error) {
      setFeedback(
        apiErrorFeedback(
          error,
          t("feedback.deleteErrorTitle"),
          t("feedback.genericError"),
        ),
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-4">
        <Link
          href={personsHref}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "w-fit text-muted-foreground",
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {t("actions.backToList")}
        </Link>

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold">{fullName}</h1>
            <p className="text-sm text-muted-foreground">
              {t("detail.description")}
            </p>
          </div>
          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Badge variant="outline">
                {person.deletedAt
                  ? t("recordStatus.deleted")
                  : t("recordStatus.active")}
              </Badge>
              <Badge
                variant="outline"
                className={
                  readinessIsReady
                    ? "border-success-subtle text-success"
                    : "border-warning-subtle text-warning"
                }
              >
                {readinessIsReady ? (
                  <BadgeCheckIcon aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <CircleAlertIcon
                    aria-hidden="true"
                    data-icon="inline-start"
                  />
                )}
                {readinessIsReady
                  ? t("detail.readiness.readyTitle")
                  : t("detail.readiness.reviewTitle")}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Link
                href={`mailto:${person.email}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <MailIcon data-icon="inline-start" />
                {t("actions.email")}
              </Link>
              <Link
                href={`tel:${person.phone}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <PhoneIcon data-icon="inline-start" />
                {t("actions.call")}
              </Link>
              <PersonFormDialog
                person={person}
                busy={busyAction === "person:update"}
                onSubmit={updatePerson}
              />
              <DocumentFormDialog
                title={t("detail.dialogs.addDocumentTitle")}
                triggerLabel={t("actions.addDocument")}
                triggerIcon={<PlusIcon data-icon="inline-start" />}
                busy={busyAction === "document:create"}
                onSubmit={(input) =>
                  createDocument(input as v1.persons.CreatePersonDocumentInput)
                }
              />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="sm" />}
                >
                  <EllipsisIcon data-icon="inline-start" />
                  {t("actions.moreActions")}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={busyAction !== null}
                      onClick={() => setDeletePersonOpen(true)}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      {t("actions.deletePerson")}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <ConfirmationDialog
                open={deletePersonOpen}
                onOpenChange={setDeletePersonOpen}
                title={t("detail.dialogs.deletePersonTitle")}
                description={t("detail.dialogs.deletePersonDescription")}
                confirmLabel={t("actions.deletePerson")}
                busy={busyAction === "person:delete"}
                onConfirm={deletePerson}
              />
            </div>
          </div>
        </div>
      </div>

      {feedback ? (
        <Alert variant={feedback.kind === "error" ? "destructive" : "default"}>
          <AlertTitle>{feedback.title}</AlertTitle>
          <AlertDescription>
            {feedback.messages.map((message) => (
              <span key={message} className="block">
                {message}
              </span>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="grid min-w-0 gap-3 rounded-lg bg-muted p-4 md:grid-cols-3 md:gap-6">
        <div className="flex items-center gap-2">
          {readinessIsReady ? (
            <BadgeCheckIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-success"
            />
          ) : (
            <CircleAlertIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-warning"
            />
          )}
          <h2 className="text-base font-semibold md:text-sm">
            {t("detail.readiness.title")}
          </h2>
        </div>
        <div className="md:col-span-2">
          {readinessIsReady ? (
            <p className="text-sm text-muted-foreground">
              {t("detail.readiness.readyDescription")}
            </p>
          ) : (
            <ul className="grid gap-2 text-sm text-muted-foreground">
              {readiness.issues.map((issue) => (
                <li key={issue} className="flex items-start gap-2">
                  <CircleAlertIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-warning"
                  />
                  <span>{t(`detail.readiness.issues.${issue}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <DetailSection
        title={t("detail.sections.profile")}
        icon={
          <UserRoundIcon aria-hidden="true" className={inlineIconClassName} />
        }
      >
        <DetailField label={t("fields.firstName")} value={person.firstName} />
        <DetailField label={t("fields.lastName")} value={person.lastName} />
        <DetailField
          label={t("fields.dateOfBirth")}
          value={formatOptionalDate(
            person.dateOfBirth,
            locale,
            t("detail.emptyValue"),
          )}
        />
        <DetailField label={t("detail.fields.personId")} value={person.id} />
        <DetailField
          label={t("detail.fields.createdAt")}
          value={formatDateTime(person.createdAt, locale)}
        />
        <DetailField
          label={t("detail.fields.updatedAt")}
          value={formatDateTime(person.updatedAt, locale)}
        />
        {person.deletedAt ? (
          <DetailField
            label={t("detail.fields.deletedAt")}
            value={formatDateTime(person.deletedAt, locale)}
          />
        ) : null}
      </DetailSection>

      <DetailSection
        title={t("sections.contact")}
        icon={<MailIcon aria-hidden="true" className={inlineIconClassName} />}
      >
        <DetailField label={t("fields.email")} value={person.email} />
        <DetailField
          label={t("fields.phone")}
          value={person.phone}
          icon={
            <PhoneIcon aria-hidden="true" className={inlineIconClassName} />
          }
        />
      </DetailSection>

      <DetailSection
        title={t("sections.address")}
        icon={<MapPinIcon aria-hidden="true" className={inlineIconClassName} />}
      >
        <DetailField
          label={t("fields.countryCode")}
          value={person.countryCode ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("fields.region")}
          value={person.region ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("fields.city")}
          value={person.city ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("fields.postalCode")}
          value={person.postalCode ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("fields.addressLine1")}
          value={person.addressLine1 ?? t("detail.emptyValue")}
          className="sm:col-span-2"
        />
        <DetailField
          label={t("fields.addressLine2")}
          value={person.addressLine2 ?? t("detail.emptyValue")}
          className="sm:col-span-2"
        />
      </DetailSection>

      <section className="grid min-w-0 gap-4 rounded-lg bg-muted p-4 md:grid-cols-3 md:gap-6">
        <div className="flex items-center gap-2">
          <FileTextIcon aria-hidden="true" className={inlineIconClassName} />
          <h2 className="text-base font-semibold md:text-sm">
            {t("fields.notes")}
          </h2>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground md:col-span-2">
          {person.notes || t("detail.emptyValue")}
        </p>
      </section>

      <section className="grid gap-4">
        <div className="flex items-center gap-2">
          <FileTextIcon aria-hidden="true" className={inlineIconClassName} />
          <h2 className="text-base font-semibold">{t("sections.document")}</h2>
        </div>
        {person.documents.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {person.documents.map((document) => (
              <DocumentDetailCard
                key={document.id}
                document={document}
                photos={photosByDocumentId[document.id] ?? []}
                locale={locale}
                busyAction={busyAction}
                onUpdate={(input) => updateDocument(document.id, input)}
                onReplace={(input) => replaceDocument(document.id, input)}
                onDelete={() => deleteDocument(document.id)}
                onUploadPhoto={(slot, file) =>
                  uploadDocumentPhoto(document.id, slot, file)
                }
                onDeletePhoto={(slot) => deleteDocumentPhoto(document.id, slot)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            {t("detail.documents.empty")}
          </div>
        )}
      </section>

      <ActivitySection events={auditEvents} locale={locale} />
    </div>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-4 rounded-lg bg-muted p-4 md:grid-cols-3 md:gap-6">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold md:text-sm">{title}</h2>
      </div>
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2 md:col-span-2">
        {children}
      </dl>
    </section>
  );
}

function DetailField({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 break-words text-sm font-medium">
        {icon}
        <span className="min-w-0 break-words">{value}</span>
      </dd>
    </div>
  );
}

function PersonFormDialog({
  person,
  busy,
  onSubmit,
}: {
  person: v1.persons.Person;
  busy: boolean;
  onSubmit: (input: v1.persons.UpdatePersonInput) => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => personFormState(person));
  const [error, setError] = useState<string | null>(null);

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(personFormState(person));
      setError(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const input = v1.persons.updatePersonInputSchema.safeParse({
      email: form.email,
      phone: form.phone,
      firstName: form.firstName,
      lastName: form.lastName,
      dateOfBirth: blankToNull(form.dateOfBirth),
      addressLine1: blankToNull(form.addressLine1),
      addressLine2: blankToNull(form.addressLine2),
      city: blankToNull(form.city),
      region: blankToNull(form.region),
      postalCode: blankToNull(form.postalCode),
      countryCode: blankToNull(form.countryCode),
      notes: blankToNull(form.notes),
    });

    if (!input.success) {
      setError(input.error.issues[0]?.message ?? t("feedback.genericError"));
      return;
    }

    if (await onSubmit(input.data)) {
      setOpen(false);
    }
  }

  function setValue<Key extends keyof PersonFormState>(
    key: Key,
    value: PersonFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="sm" />}
      >
        <PencilIcon data-icon="inline-start" />
        {t("actions.editPerson")}
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          <DialogHeader>
            <DialogTitle>{t("detail.dialogs.editPersonTitle")}</DialogTitle>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{t("feedback.updateErrorTitle")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField
              label={t("fields.firstName")}
              value={form.firstName}
              onChange={(value) => setValue("firstName", value)}
            />
            <TextInputField
              label={t("fields.lastName")}
              value={form.lastName}
              onChange={(value) => setValue("lastName", value)}
            />
            <TextInputField
              label={t("fields.email")}
              type="email"
              value={form.email}
              onChange={(value) => setValue("email", value)}
            />
            <TextInputField
              label={t("fields.phone")}
              value={form.phone}
              onChange={(value) => setValue("phone", value)}
            />
            <TextInputField
              label={t("fields.dateOfBirth")}
              type="date"
              value={form.dateOfBirth}
              onChange={(value) => setValue("dateOfBirth", value)}
            />
            <TextInputField
              label={t("fields.countryCode")}
              value={form.countryCode}
              onChange={(value) => setValue("countryCode", value)}
            />
            <TextInputField
              label={t("fields.region")}
              value={form.region}
              onChange={(value) => setValue("region", value)}
            />
            <TextInputField
              label={t("fields.city")}
              value={form.city}
              onChange={(value) => setValue("city", value)}
            />
            <TextInputField
              label={t("fields.postalCode")}
              value={form.postalCode}
              onChange={(value) => setValue("postalCode", value)}
            />
            <TextInputField
              label={t("fields.addressLine1")}
              value={form.addressLine1}
              className="sm:col-span-2"
              onChange={(value) => setValue("addressLine1", value)}
            />
            <TextInputField
              label={t("fields.addressLine2")}
              value={form.addressLine2}
              className="sm:col-span-2"
              onChange={(value) => setValue("addressLine2", value)}
            />
            <TextareaField
              label={t("fields.notes")}
              value={form.notes}
              className="sm:col-span-2"
              onChange={(value) => setValue("notes", value)}
            />
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("actions.cancel")}
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? t("actions.saving") : t("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type DocumentFormDialogProps = {
  title: string;
  triggerLabel: string;
  triggerIcon: ReactNode;
  document?: v1.persons.PersonDocument;
  busy: boolean;
  submitMode?: "create" | "update";
  onSubmit: (
    input:
      | v1.persons.CreatePersonDocumentInput
      | v1.persons.UpdatePersonDocumentInput,
  ) => Promise<boolean>;
};

function DocumentFormDialog({
  title,
  triggerLabel,
  triggerIcon,
  document,
  busy,
  submitMode = "create",
  onSubmit,
}: DocumentFormDialogProps) {
  const t = useTranslations("persons");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => documentFormState(document));
  const [error, setError] = useState<string | null>(null);

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(documentFormState(document));
      setError(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const candidate = {
      type: form.type,
      series: blankToNull(form.series),
      number: blankToNull(form.number),
      cnp: blankToNull(form.cnp),
      issuingCountryCode: blankToNull(form.issuingCountryCode),
      issuedBy: blankToNull(form.issuedBy),
      issuedOn: blankToNull(form.issuedOn),
      expiresOn: blankToNull(form.expiresOn),
      status: form.status,
      notes: blankToNull(form.notes),
    };
    if (submitMode === "create") {
      const input =
        v1.persons.createPersonDocumentInputSchema.safeParse(candidate);
      if (!input.success) {
        setError(input.error.issues[0]?.message ?? t("feedback.genericError"));
        return;
      }

      if (await onSubmit(input.data)) {
        setOpen(false);
      }
      return;
    }

    const input =
      v1.persons.updatePersonDocumentInputSchema.safeParse(candidate);
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? t("feedback.genericError"));
      return;
    }

    if (await onSubmit(input.data)) {
      setOpen(false);
    }
  }

  function setValue<Key extends keyof DocumentFormState>(
    key: Key,
    value: DocumentFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="sm" />}
      >
        {triggerIcon}
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{t("feedback.updateErrorTitle")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t("fields.documentType")}
              value={form.type}
              values={v1.persons.PERSON_DOCUMENT_TYPES}
              labelForValue={(value) => t(`documentTypes.${value}`)}
              onChange={(value) =>
                setValue("type", value as v1.persons.PersonDocumentType)
              }
            />
            <SelectField
              label={t("fields.documentStatus")}
              value={form.status}
              values={v1.persons.PERSON_DOCUMENT_STATUSES}
              labelForValue={(value) => t(`documentStatuses.${value}`)}
              onChange={(value) =>
                setValue("status", value as v1.persons.PersonDocumentStatus)
              }
            />
            <TextInputField
              label={t("fields.documentSeries")}
              value={form.series}
              onChange={(value) => setValue("series", value)}
            />
            <TextInputField
              label={t("fields.documentNumber")}
              value={form.number}
              onChange={(value) => setValue("number", value)}
            />
            <TextInputField
              label={t("fields.documentCnp")}
              value={form.cnp}
              onChange={(value) => setValue("cnp", value)}
            />
            <TextInputField
              label={t("fields.documentIssuingCountryCode")}
              value={form.issuingCountryCode}
              onChange={(value) => setValue("issuingCountryCode", value)}
            />
            <TextInputField
              label={t("fields.documentIssuedBy")}
              value={form.issuedBy}
              onChange={(value) => setValue("issuedBy", value)}
            />
            <TextInputField
              label={t("fields.documentIssuedOn")}
              type="date"
              value={form.issuedOn}
              onChange={(value) => setValue("issuedOn", value)}
            />
            <TextInputField
              label={t("fields.documentExpiresOn")}
              type="date"
              value={form.expiresOn}
              onChange={(value) => setValue("expiresOn", value)}
            />
            <TextareaField
              label={t("fields.notes")}
              value={form.notes}
              className="sm:col-span-2"
              onChange={(value) => setValue("notes", value)}
            />
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("actions.cancel")}
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? t("actions.saving") : t("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmationDialog({
  open,
  onOpenChange,
  triggerLabel,
  triggerIcon,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerLabel?: string;
  triggerIcon?: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const [internalOpen, setInternalOpen] = useState(false);
  const actualOpen = open ?? internalOpen;
  const setActualOpen = onOpenChange ?? setInternalOpen;

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    setActualOpen(nextOpen);
  }

  async function confirm() {
    if (await onConfirm()) {
      setActualOpen(false);
    }
  }

  return (
    <Dialog open={actualOpen} onOpenChange={changeOpen}>
      {triggerLabel ? (
        <DialogTrigger
          render={<Button type="button" variant="outline" size="sm" />}
        >
          {triggerIcon}
          {triggerLabel}
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="outline" disabled={busy} />}
          >
            {t("actions.cancel")}
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? t("actions.deleting") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentStatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: v1.persons.PersonDocumentStatus;
  disabled: boolean;
  onChange: (status: v1.persons.PersonDocumentStatus) => Promise<boolean>;
}) {
  const t = useTranslations("persons");

  return (
    <Select
      value={value}
      onValueChange={(nextValue) =>
        void onChange(nextValue as v1.persons.PersonDocumentStatus)
      }
    >
      <SelectTrigger
        aria-label={t("fields.documentStatus")}
        size="sm"
        disabled={disabled}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {v1.persons.PERSON_DOCUMENT_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {t(`documentStatuses.${status}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TextInputField({
  label,
  value,
  onChange,
  type = "text",
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function SelectField<Value extends string>({
  label,
  value,
  values,
  labelForValue,
  onChange,
}: {
  label: string;
  value: Value;
  values: readonly Value[];
  labelForValue: (value: Value) => string;
  onChange: (value: Value) => void;
}) {
  const id = useId();

  return (
    <div className="grid gap-2">
      <Label id={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={(nextValue) => onChange(nextValue as Value)}
      >
        <SelectTrigger aria-labelledby={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem key={item} value={item}>
              {labelForValue(item)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DocumentDetailCard({
  document,
  photos,
  locale,
  busyAction,
  onUpdate,
  onReplace,
  onDelete,
  onUploadPhoto,
  onDeletePhoto,
}: {
  document: v1.persons.PersonDocument;
  photos: v1.persons.PersonDocumentPhoto[];
  locale: string;
  busyAction: string | null;
  onUpdate: (input: v1.persons.UpdatePersonDocumentInput) => Promise<boolean>;
  onReplace: (input: v1.persons.CreatePersonDocumentInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onUploadPhoto: (
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File,
  ) => Promise<boolean>;
  onDeletePhoto: (slot: v1.persons.PersonDocumentPhotoSlot) => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const TypeIcon = documentTypeIcons[document.type];
  const StatusIcon = documentStatusIcons[document.status];
  const shouldShowReplace =
    document.status === "expired" || document.status === "rejected";

  return (
    <Card size="sm">
      <CardHeader className="gap-3 has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <TypeIcon
            aria-label={t(`documentTypes.${document.type}`)}
            className={inlineIconClassName}
          />
          <span className="min-w-0 truncate">
            {t(`documentTypes.${document.type}`)}
          </span>
        </CardTitle>
        <CardAction className="col-start-1 row-start-2 justify-self-start sm:col-start-2 sm:row-start-1 sm:justify-self-end">
          <div className="flex flex-wrap gap-2">
            {shouldShowReplace ? (
              <DocumentFormDialog
                title={t("detail.dialogs.replaceDocumentTitle")}
                triggerLabel={t("actions.replaceDocument")}
                triggerIcon={<RefreshCwIcon data-icon="inline-start" />}
                document={document}
                busy={busyAction === `document:replace:${document.id}`}
                submitMode="create"
                onSubmit={(input) =>
                  onReplace(input as v1.persons.CreatePersonDocumentInput)
                }
              />
            ) : null}
            <DocumentFormDialog
              title={t("detail.dialogs.editDocumentTitle")}
              triggerLabel={t("actions.editDocument")}
              triggerIcon={<PencilIcon data-icon="inline-start" />}
              document={document}
              busy={busyAction === `document:update:${document.id}`}
              submitMode="update"
              onSubmit={(input) =>
                onUpdate(input as v1.persons.UpdatePersonDocumentInput)
              }
            />
            <ConfirmationDialog
              triggerLabel={t("actions.deleteDocument")}
              triggerIcon={<Trash2Icon data-icon="inline-start" />}
              title={t("detail.dialogs.deleteDocumentTitle")}
              description={t("detail.dialogs.deleteDocumentDescription")}
              confirmLabel={t("actions.deleteDocument")}
              busy={busyAction === `document:delete:${document.id}`}
              onConfirm={onDelete}
            />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            variant="outline"
            className={cn("w-fit", documentStatusClasses[document.status])}
          >
            <StatusIcon
              aria-label={t(`documentStatuses.${document.status}`)}
              data-icon="inline-start"
            />
            {t(`documentStatuses.${document.status}`)}
          </Badge>
          <DocumentStatusSelect
            value={document.status}
            disabled={busyAction !== null}
            onChange={(status) => onUpdate({ status })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("detail.documents.masked")}
        </p>

        <DocumentPhotosPanel
          documentId={document.id}
          photos={photos}
          busyAction={busyAction}
          onUploadPhoto={onUploadPhoto}
          onDeletePhoto={onDeletePhoto}
        />

        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailField
            label={t("fields.documentSeries")}
            value={document.series ?? t("detail.emptyValue")}
          />
          <DetailField
            label={t("fields.documentNumber")}
            value={maskSensitiveValue(document.number, t("detail.emptyValue"))}
          />
          <DetailField
            label={t("fields.documentCnp")}
            value={maskSensitiveValue(document.cnp, t("detail.emptyValue"))}
          />
          <DetailField
            label={t("fields.documentIssuingCountryCode")}
            value={document.issuingCountryCode ?? t("detail.emptyValue")}
          />
          <DetailField
            label={t("fields.documentIssuedBy")}
            value={document.issuedBy ?? t("detail.emptyValue")}
          />
          <DetailField
            label={t("fields.documentIssuedOn")}
            value={formatOptionalDate(
              document.issuedOn,
              locale,
              t("detail.emptyValue"),
            )}
          />
          <DetailField
            label={t("fields.documentExpiresOn")}
            value={formatOptionalDate(
              document.expiresOn,
              locale,
              t("detail.emptyValue"),
            )}
            icon={
              <CalendarDaysIcon
                aria-hidden="true"
                className={inlineIconClassName}
              />
            }
          />
          <DetailField
            label={t("detail.fields.documentId")}
            value={document.id}
          />
          <DetailField
            label={t("fields.notes")}
            value={document.notes ?? t("detail.emptyValue")}
            className="sm:col-span-2"
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function DocumentPhotosPanel({
  documentId,
  photos,
  busyAction,
  onUploadPhoto,
  onDeletePhoto,
}: {
  documentId: string;
  photos: v1.persons.PersonDocumentPhoto[];
  busyAction: string | null;
  onUploadPhoto: (
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File,
  ) => Promise<boolean>;
  onDeletePhoto: (slot: v1.persons.PersonDocumentPhotoSlot) => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const photosBySlot = new Map(photos.map((photo) => [photo.slot, photo]));

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <ImageIcon aria-hidden="true" className={inlineIconClassName} />
        <h3 className="text-sm font-medium">
          {t("detail.documents.photosTitle")}
        </h3>
      </div>
      <div className="grid gap-3">
        {v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS.map((slot) => {
          const photo = photosBySlot.get(slot);
          const inputId = `document-${documentId}-${slot}-photo`;
          const uploadBusy =
            busyAction === `document-photo:upload:${documentId}:${slot}`;
          const deleteBusy =
            busyAction === `document-photo:delete:${documentId}:${slot}`;
          const disabled = busyAction !== null;
          const slotLabel = t(`documentPhotoSlots.${slot}`);
          const imageUrl = photo ? webApi.url(photo.contentUrl) : null;

          return (
            <div
              key={slot}
              className="grid gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{slotLabel}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {photo
                      ? t("detail.documents.photoMetadata", {
                          contentType: photo.contentType,
                          byteSize: photo.byteSize,
                        })
                      : t("detail.documents.noPhoto")}
                  </span>
                </div>
                {photo ? (
                  <ConfirmationDialog
                    triggerLabel={t("actions.deleteDocumentPhoto")}
                    triggerIcon={<Trash2Icon data-icon="inline-start" />}
                    title={t("detail.dialogs.deleteDocumentPhotoTitle")}
                    description={t(
                      "detail.dialogs.deleteDocumentPhotoDescription",
                    )}
                    confirmLabel={t("actions.deleteDocumentPhoto")}
                    busy={deleteBusy}
                    onConfirm={() => onDeletePhoto(slot)}
                  />
                ) : null}
              </div>

              {photo && imageUrl ? (
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- protected API images must load with browser cookies */}
                  <img
                    src={imageUrl}
                    alt={t("detail.documents.photoAlt", { slot: slotLabel })}
                    className="h-40 w-full object-cover"
                  />
                </a>
              ) : (
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground">
                  <ImageIcon aria-hidden="true" className="size-5" />
                  <span className="sr-only">
                    {t("detail.documents.noPhoto")}
                  </span>
                </div>
              )}

              <div className="grid gap-2 sm:flex sm:items-end sm:justify-between">
                <div className="grid flex-1 gap-1">
                  <Label htmlFor={inputId} className="text-xs font-medium">
                    {t("detail.documents.photoUploadLabel", {
                      slot: slotLabel,
                    })}
                  </Label>
                  <Input
                    id={inputId}
                    type="file"
                    accept={documentPhotoAccept}
                    disabled={disabled}
                    onChange={(event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0];
                      if (!file) return;
                      void onUploadPhoto(slot, file).finally(() => {
                        input.value = "";
                      });
                    }}
                  />
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <UploadIcon aria-hidden="true" className="size-3.5" />
                  {uploadBusy
                    ? t("actions.uploadingDocumentPhoto")
                    : t("detail.documents.photoFileTypes")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivitySection({
  events,
  locale,
}: {
  events: v1.persons.PersonAuditEvent[];
  locale: string;
}) {
  const t = useTranslations("persons");

  return (
    <section className="grid gap-4">
      <div className="flex items-center gap-2">
        <FileTextIcon aria-hidden="true" className={inlineIconClassName} />
        <h2 className="text-base font-semibold">
          {t("detail.activity.title")}
        </h2>
      </div>
      {events.length > 0 ? (
        <ol className="grid gap-3">
          {events.map((event) => (
            <li key={event.id}>
              <Card size="sm">
                <CardHeader className="gap-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{t(`detail.activity.eventTypes.${event.type}`)}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {formatDateTime(event.createdAt, locale)}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {actorLabel(event.actor, t)}
                  </p>
                </CardHeader>
                <CardContent>
                  {event.changes.length > 0 ? (
                    <ul className="grid gap-1 text-sm text-muted-foreground">
                      {event.changes.map((change) => (
                        <li key={`${event.id}-${change.field}`}>
                          {formatAuditChange(change, t)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("detail.activity.noChanges")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {t("detail.activity.empty")}
        </div>
      )}
    </section>
  );
}

function getRentalReadiness(person: v1.persons.Person): {
  issues: ReadinessIssue[];
} {
  const documents = person.documents.filter((document) => !document.deletedAt);
  const issues: ReadinessIssue[] = [];

  if (
    !documents.some((document) =>
      v1.persons.isPersonIdentityDocumentType(document.type),
    )
  ) {
    issues.push("missingIdentity");
  }

  if (!documents.some((document) => document.type === "driverLicense")) {
    issues.push("missingDriverLicense");
  }

  if (documents.some((document) => document.status === "rejected")) {
    issues.push("hasRejected");
  }

  if (documents.some(isExpiredDocument)) {
    issues.push("hasExpired");
  }

  if (documents.some((document) => document.status === "unverified")) {
    issues.push("hasUnverified");
  }

  return { issues };
}

function isExpiredDocument(document: v1.persons.PersonDocument): boolean {
  if (document.status === "expired") {
    return true;
  }

  if (!document.expiresOn) {
    return false;
  }

  const expiryDate = dateOnlyToUtcTime(document.expiresOn);
  if (expiryDate == null) {
    return false;
  }

  const now = new Date();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return expiryDate < today;
}

function dateOnlyToUtcTime(value: string): number | null {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return Date.UTC(year, month - 1, day);
}

function maskSensitiveValue(value: string | null, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const visibleLength = Math.min(4, value.length);
  const hiddenLength = Math.max(4, value.length - visibleLength);

  return `${"*".repeat(hiddenLength)}${value.slice(-visibleLength)}`;
}

function formatOptionalDate(
  value: string | null,
  locale: string,
  fallback: string,
): string {
  return value ? formatDate(value, locale) : fallback;
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

interface PersonFormState {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  notes: string;
}

interface DocumentFormState {
  type: v1.persons.PersonDocumentType;
  series: string;
  number: string;
  cnp: string;
  issuingCountryCode: string;
  issuedBy: string;
  issuedOn: string;
  expiresOn: string;
  status: v1.persons.PersonDocumentStatus;
  notes: string;
}

function personFormState(person: v1.persons.Person): PersonFormState {
  return {
    email: person.email,
    phone: person.phone,
    firstName: person.firstName,
    lastName: person.lastName,
    dateOfBirth: person.dateOfBirth ?? "",
    addressLine1: person.addressLine1 ?? "",
    addressLine2: person.addressLine2 ?? "",
    city: person.city ?? "",
    region: person.region ?? "",
    postalCode: person.postalCode ?? "",
    countryCode: person.countryCode ?? "",
    notes: person.notes ?? "",
  };
}

function documentFormState(
  document?: v1.persons.PersonDocument,
): DocumentFormState {
  return {
    type: document?.type ?? "nationalId",
    series: document?.series ?? "",
    number: document?.number ?? "",
    cnp: document?.cnp ?? "",
    issuingCountryCode: document?.issuingCountryCode ?? "",
    issuedBy: document?.issuedBy ?? "",
    issuedOn: document?.issuedOn ?? "",
    expiresOn: document?.expiresOn ?? "",
    status: document?.status ?? "verified",
    notes: document?.notes ?? "",
  };
}

function upsertDocumentPhoto(
  current: DocumentPhotosByDocumentId,
  documentId: string,
  photo: v1.persons.PersonDocumentPhoto,
): DocumentPhotosByDocumentId {
  const photos = current[documentId] ?? [];
  return {
    ...current,
    [documentId]: sortDocumentPhotos([
      ...photos.filter((existing) => existing.slot !== photo.slot),
      photo,
    ]),
  };
}

function removeDocumentPhoto(
  current: DocumentPhotosByDocumentId,
  documentId: string,
  slot: v1.persons.PersonDocumentPhotoSlot,
): DocumentPhotosByDocumentId {
  return {
    ...current,
    [documentId]: (current[documentId] ?? []).filter(
      (photo) => photo.slot !== slot,
    ),
  };
}

function sortDocumentPhotos(
  photos: v1.persons.PersonDocumentPhoto[],
): v1.persons.PersonDocumentPhoto[] {
  const slotOrder = new Map(
    v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS.map((slot, index) => [slot, index]),
  );
  return photos.toSorted(
    (first, second) =>
      (slotOrder.get(first.slot) ?? Number.MAX_SAFE_INTEGER) -
      (slotOrder.get(second.slot) ?? Number.MAX_SAFE_INTEGER),
  );
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function apiErrorFeedback(
  error: unknown,
  title: string,
  fallback: string,
): Feedback {
  return {
    kind: "error",
    title,
    messages: [error instanceof ApiError ? error.message : fallback],
  };
}

function actorLabel(
  actor: v1.persons.PersonAuditActor,
  t: PersonsTranslations,
): string {
  if (actor.kind === "system") {
    return actor.name ?? t("detail.activity.systemActor");
  }

  return actor.name ?? actor.email ?? t("detail.activity.unknownActor");
}

function formatAuditChange(
  change: v1.persons.PersonAuditFieldChange,
  t: PersonsTranslations,
): string {
  const field = auditFieldLabel(change.field, t);

  if (change.oldValue && change.newValue) {
    return t("detail.activity.changedFromTo", {
      field,
      oldValue: change.oldValue,
      newValue: change.newValue,
    });
  }

  if (change.newValue) {
    return t("detail.activity.changedTo", {
      field,
      newValue: change.newValue,
    });
  }

  return t("detail.activity.cleared", { field });
}

function auditFieldLabel(field: string, t: PersonsTranslations): string {
  switch (field) {
    case "email":
      return t("fields.email");
    case "phone":
      return t("fields.phone");
    case "firstName":
      return t("fields.firstName");
    case "lastName":
      return t("fields.lastName");
    case "dateOfBirth":
      return t("fields.dateOfBirth");
    case "addressLine1":
      return t("fields.addressLine1");
    case "addressLine2":
      return t("fields.addressLine2");
    case "city":
      return t("fields.city");
    case "region":
      return t("fields.region");
    case "postalCode":
      return t("fields.postalCode");
    case "countryCode":
      return t("fields.countryCode");
    case "notes":
    case "document.notes":
      return t("fields.notes");
    case "document.type":
      return t("fields.documentType");
    case "document.series":
      return t("fields.documentSeries");
    case "document.number":
      return t("fields.documentNumber");
    case "document.cnp":
      return t("fields.documentCnp");
    case "document.issuingCountryCode":
      return t("fields.documentIssuingCountryCode");
    case "document.issuedBy":
      return t("fields.documentIssuedBy");
    case "document.issuedOn":
      return t("fields.documentIssuedOn");
    case "document.expiresOn":
      return t("fields.documentExpiresOn");
    case "document.status":
      return t("fields.documentStatus");
    default:
      return field;
  }
}

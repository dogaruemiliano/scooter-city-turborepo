"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  FieldLabel,
  FormActions,
  FormSection,
  Input,
  Textarea,
} from "@repo/ui/components";
import { SaveButton } from "@repo/ui/components/save-button";
import { useFormatter, useTranslations } from "next-intl";
import { useSession } from "@/components/auth/SessionProvider";
import {
  Choice,
  Feedback,
  RemoteState,
  useRemote,
  useTask,
} from "@/components/WorkspaceForm";
import { PageTitleOverride } from "@/components/PageTitleOverride";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import { downloadContractFile } from "@/lib/contract-download";
import { useFormAction } from "@/lib/form/use-form-action";

const root = "/v1/contracts";
type Template = v1.contracts.TemplateList["items"][number];
type Version = Template["versions"][number];

export function ContractTemplatesWorkspace() {
  const t = useTranslations("contracts");
  const { user } = useSession();
  const load = useCallback(
    () =>
      webApi.fetch(`${root}/templates`, v1.contracts.templateListSchema, {
        cache: "no-store",
      }),
    [],
  );
  const remote = useRemote(load);
  return (
    <div className="flex flex-col gap-6">
      <PageTitleOverride title={t("title")} />
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      {canAccess(user, "templates.manage") ? (
        <>
          {canAccess(user, "templates.publish") ? (
            <ContractSettingsForm />
          ) : null}
          <CreateTemplate onComplete={remote.reload} />
        </>
      ) : null}
      {!remote.data ? (
        <RemoteState error={remote.error} retry={remote.reload} />
      ) : (
        <>
          <Feedback error={remote.error} />
          {remote.data.items.length ? (
            remote.data.items.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                reload={remote.reload}
              />
            ))
          ) : (
            <p>{t("noTemplates")}</p>
          )}
          <TemplateSets data={remote.data} reload={remote.reload} />
        </>
      )}
    </div>
  );
}

function CreateTemplate({ onComplete }: { onComplete: () => void }) {
  const t = useTranslations("contracts");
  const action = useFormAction();
  const task = useTask();
  const [name, setName] = useState("");
  const [type, setType] =
    useState<v1.contracts.ContractTemplateType>("RENTAL_AGREEMENT");
  const [locale, setLocale] = useState("ro");
  async function submit(event: FormEvent) {
    event.preventDefault();
    await task.run(async () => {
      const json = v1.contracts.createTemplateInputSchema.parse({
        name,
        type,
        locale,
      });
      await webApi.fetch(
        `${root}/templates`,
        v1.contracts.contractTemplateSchema,
        { method: "POST", json },
      );
      setName("");
      onComplete();
    });
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormSection title={t("newTemplate")} panel>
        <Field>
          <FieldLabel htmlFor="template-name">{t("name")}</FieldLabel>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            disabled={task.busy}
          />
        </Field>
        <Choice
          label={t("type")}
          value={type}
          onChange={(value) =>
            setType(v1.contracts.templateTypeSchema.parse(value))
          }
          options={v1.contracts.templateTypes.map((value) => ({
            value,
            label: t(value),
          }))}
          disabled={task.busy}
        />
        <Choice
          label={t("locale")}
          value={locale}
          onChange={setLocale}
          options={[
            { value: "ro", label: "Română" },
            { value: "en", label: "English" },
          ]}
          disabled={task.busy}
        />
      </FormSection>
      <Feedback error={task.error} />
      <FormActions>
        <SaveButton
          type="submit"
          disabled={!name.trim()}
          {...action(
            "create",
            { pending: task.busy, error: task.error },
            t("newTemplate"),
          )}
        />
      </FormActions>
    </form>
  );
}

function TemplateCard({
  template,
  reload,
}: {
  template: Template;
  reload: () => void;
}) {
  const t = useTranslations("contracts");
  const action = useFormAction();
  const task = useTask();
  const { user } = useSession();
  const file = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    await task.run(async () => {
      const body = new FormData();
      body.set("file", selected);
      const previous = template.versions[0];
      if (previous) body.set("previousVersionId", previous.id);
      await webApi.fetch(
        `${root}/templates/${template.id}/versions`,
        v1.contracts.templateVersionSchema,
        { method: "POST", body },
      );
      setSelected(null);
      if (file.current) file.current.value = "";
      reload();
    });
  }
  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">{template.name}</h2>
        <Badge variant="secondary">{t(template.type)}</Badge>
        <span className="text-sm text-muted-foreground">{template.locale}</span>
      </header>
      {canAccess(user, "templates.manage") ? (
        <form onSubmit={upload} className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor={`source-${template.id}`}>
              {t("source")}
            </FieldLabel>
            <Input
              ref={file}
              id={`source-${template.id}`}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={task.busy}
              onChange={(e) => setSelected(e.target.files?.[0] ?? null)}
            />
          </Field>
          <FormActions>
            <SaveButton
              type="submit"
              disabled={!selected}
              {...action(
                "create",
                { pending: task.busy, error: task.error },
                t("newVersion"),
              )}
            />
          </FormActions>
          <Feedback error={task.error} />
        </form>
      ) : null}
      <h3 className="text-base font-semibold">{t("history")}</h3>
      {template.versions.map((version) => (
        <TemplateVersion
          key={`${version.id}-${version.validationStatus}-${version.approvedBy}-${version.status}`}
          version={version}
          reload={reload}
        />
      ))}
    </section>
  );
}

function TemplateVersion({
  version,
  reload,
}: {
  version: Version;
  reload: () => void;
}) {
  const t = useTranslations("contracts");
  const format = useFormatter();
  const action = useFormAction();
  const task = useTask();
  const { user } = useSession();
  const [reviewed, setReviewed] = useState(false);
  async function perform(operation: string, json: unknown = {}) {
    await task.run(async () => {
      await webApi.fetch<unknown>(
        `${root}/versions/${version.id}/${operation}`,
        operation === "approve"
          ? z.object({ id: z.string(), approved: z.literal(true) })
          : operation === "archive"
            ? z.object({ id: z.string(), status: z.literal("ARCHIVED") })
            : v1.contracts.templateVersionSchema,
        { method: "POST", json },
      );
      reload();
    });
  }
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        {t("version", { version: version.version })} · {t(version.status)} ·{" "}
        {t(version.validationStatus)}
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <dl className="flex flex-col gap-2 text-sm">
          <dt>{t("sha")}</dt>
          <dd className="break-all font-mono">{version.sourceSha256}</dd>
          {version.publishedAt ? (
            <>
              <dt>{t("publishedAt")}</dt>
              <dd>
                <time dateTime={version.publishedAt}>
                  {format.dateTime(new Date(version.publishedAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: v1.rentals.RENTAL_POLICY.timezone,
                  })}
                </time>
              </dd>
            </>
          ) : null}
        </dl>
        <Button
          variant="outline"
          disabled={task.busy}
          onClick={() =>
            void task.run(() =>
              downloadContractFile(
                `${root}/versions/${version.id}/source`,
                `template-v${version.version}.docx`,
              ),
            )
          }
        >
          {t("downloadSource")}
        </Button>
        {version.validation ? (
          <div>
            <h4 className="text-sm font-medium">{t("validation")}</h4>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(version.validation, null, 2)}
            </pre>
          </div>
        ) : null}
        {version.validationStatus === "PASSED" ? (
          <div className="flex flex-wrap gap-3">
            {[
              "25",
              "45",
              "NO_LIMITER",
              "LONG_NAMES",
              "ABSENT_EQUIPMENT",
              "DEFECTS",
            ].map((scenario) => (
              <Button
                key={scenario}
                variant="outline"
                disabled={task.busy}
                onClick={() =>
                  void task.run(() =>
                    downloadContractFile(
                      `${root}/versions/${version.id}/previews/${scenario}`,
                      `preview-${scenario}.pdf`,
                    ),
                  )
                }
              >
                {t("preview")} · {scenario}
              </Button>
            ))}
          </div>
        ) : null}
        {version.status === "DRAFT" ? (
          <>
            {canAccess(user, "templates.manage") ? (
              <SaveButton
                type="button"
                {...action(
                  "verify",
                  { pending: task.busy, error: task.error },
                  t("validate"),
                )}
                onClick={() => void perform("validate")}
              />
            ) : null}
            {version.validationStatus === "PASSED" &&
            canAccess(user, "templates.publish") ? (
              <>
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={reviewed}
                    onCheckedChange={(value) => setReviewed(value === true)}
                    disabled={task.busy}
                  />
                  {t("reviewStatement")}
                </label>
                <SaveButton
                  type="button"
                  disabled={!reviewed || !version.manifestHash}
                  {...action(
                    "confirm",
                    { pending: task.busy, error: task.error },
                    t("approve"),
                  )}
                  onClick={() =>
                    void perform("approve", {
                      manifestHash: version.manifestHash,
                      reviewStatement: t("reviewStatement"),
                    })
                  }
                />
                <SaveButton
                  type="button"
                  disabled={!version.approvedBy}
                  {...action(
                    "confirm",
                    { pending: task.busy, error: task.error },
                    t("publish"),
                  )}
                  onClick={() =>
                    void perform("publish", {
                      idempotencyKey: crypto.randomUUID(),
                    })
                  }
                />
              </>
            ) : null}
          </>
        ) : version.status === "PUBLISHED" &&
          canAccess(user, "templates.archive") ? (
          <SaveButton
            type="button"
            variant="outline"
            {...action(
              "update",
              { pending: task.busy, error: task.error },
              t("archive"),
            )}
            onClick={() => void perform("archive")}
          />
        ) : null}
        <Feedback error={task.error} />
      </div>
    </details>
  );
}

function TemplateSets({
  data,
  reload,
}: {
  data: v1.contracts.TemplateList;
  reload: () => void;
}) {
  const t = useTranslations("contracts");
  const action = useFormAction();
  const task = useTask();
  const { user } = useSession();
  const [name, setName] = useState("");
  const [locale, setLocale] = useState("ro");
  const [agreementVersionId, agreement] = useState("");
  const [gdprVersionId, gdpr] = useState("");
  const [technicalVersionId, technical] = useState("");
  const [promotionVersionId, promotion] = useState("");
  const [promotionApproved, approvePromotion] = useState(false);
  const [reason, setReason] = useState("");
  const options = (type: v1.contracts.ContractTemplateType) =>
    data.items
      .filter((item) => item.type === type && item.locale === locale)
      .flatMap((item) =>
        item.versions
          .filter((version) => version.status === "PUBLISHED")
          .map((version) => ({
            value: version.id,
            label: `${item.name} · ${t("version", { version: version.version })}`,
          })),
      );
  async function submit(event: FormEvent) {
    event.preventDefault();
    await task.run(async () => {
      const json = v1.contracts.createTemplateSetInputSchema.parse({
        name,
        locale,
        agreementVersionId,
        gdprVersionId,
        technicalVersionId,
        ...(promotionVersionId
          ? { promotionVersionId, promotionApproved }
          : {}),
      });
      await webApi.fetch(`${root}/sets`, v1.contracts.templateSetSchema, {
        method: "POST",
        json,
      });
      setName("");
      reload();
    });
  }
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t("sets")}</h2>
      {canAccess(user, "templates.publish") ? (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FormSection panel>
            <Field>
              <FieldLabel htmlFor="set-name">{t("setName")}</FieldLabel>
              <Input
                id="set-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={task.busy}
              />
            </Field>
            <Choice
              label={t("locale")}
              value={locale}
              onChange={(value) => {
                setLocale(value);
                agreement("");
                gdpr("");
                technical("");
                promotion("");
                approvePromotion(false);
              }}
              options={[
                { value: "ro", label: "Română" },
                { value: "en", label: "English" },
              ]}
              disabled={task.busy}
            />
            <Choice
              label={t("RENTAL_AGREEMENT")}
              value={agreementVersionId}
              onChange={agreement}
              options={options("RENTAL_AGREEMENT")}
              disabled={task.busy}
            />
            <Choice
              label={t("GDPR_NOTICE")}
              value={gdprVersionId}
              onChange={gdpr}
              options={options("GDPR_NOTICE")}
              disabled={task.busy}
            />
            <Choice
              label={t("TECHNICAL_HANDOVER")}
              value={technicalVersionId}
              onChange={technical}
              options={options("TECHNICAL_HANDOVER")}
              disabled={task.busy}
            />
            <Choice
              label={t("PROMOTION_ADDENDUM")}
              value={promotionVersionId}
              onChange={(value) => {
                promotion(value);
                approvePromotion(false);
              }}
              options={[
                { value: "", label: t("noPromotion") },
                ...options("PROMOTION_ADDENDUM"),
              ]}
              disabled={task.busy}
            />
            {promotionVersionId ? (
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={promotionApproved}
                  onCheckedChange={(value) => approvePromotion(value === true)}
                  disabled={task.busy}
                />
                {t("promotionReviewed")}
              </label>
            ) : null}
          </FormSection>
          <FormActions>
            <SaveButton
              type="submit"
              disabled={
                !name ||
                !agreementVersionId ||
                !gdprVersionId ||
                !technicalVersionId
              }
              {...action(
                "create",
                { pending: task.busy, error: task.error },
                t("newSet"),
              )}
            />
          </FormActions>
        </form>
      ) : null}
      {data.sets.length ? (
        data.sets.map((set) => (
          <div
            key={set.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border p-4"
          >
            <span className="flex-1 text-sm font-medium">
              {set.name} · {t("version", { version: set.version })}
            </span>
            <Badge variant="secondary">
              {t(set.id === data.activeSetId ? "active" : "inactive")}
            </Badge>
            {set.id !== data.activeSetId &&
            canAccess(user, "templates.publish") ? (
              <SaveButton
                type="button"
                disabled={reason.trim().length < 5}
                {...action(
                  "confirm",
                  { pending: task.busy, error: task.error },
                  t(
                    set.version <
                      (data.sets.find(
                        (active) => active.id === data.activeSetId,
                      )?.version ?? 0)
                      ? "rollback"
                      : "activate",
                  ),
                )}
                onClick={() =>
                  void task.run(async () => {
                    await webApi.fetch(
                      `${root}/sets/${set.id}/activate`,
                      z.object({ activeSetId: z.string() }),
                      {
                        method: "POST",
                        json: {
                          idempotencyKey: crypto.randomUUID(),
                          expectedActiveSetId: data.activeSetId,
                          reason,
                        },
                      },
                    );
                    reload();
                  })
                }
              />
            ) : null}
          </div>
        ))
      ) : (
        <p>{t("noSets")}</p>
      )}
      {canAccess(user, "templates.publish") ? (
        <Field>
          <FieldLabel htmlFor="set-reason">{t("reason")}</FieldLabel>
          <Textarea
            id="set-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            disabled={task.busy}
          />
        </Field>
      ) : null}
      <Feedback error={task.error} />
    </section>
  );
}

const settingsResponse = z.object({
  settings: v1.contracts.contractSettingsInputSchema.nullable(),
  companyId: z.string(),
});
function ContractSettingsForm() {
  const t = useTranslations("contracts");
  const task = useTask();
  const load = useCallback(
    () =>
      webApi.fetch(`${root}/settings`, settingsResponse, { cache: "no-store" }),
    [],
  );
  const remote = useRemote(load);
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer text-base font-semibold">
        {t("settings.title")}
      </summary>
      {remote.data ? (
        <SettingsFields
          key={JSON.stringify(remote.data.settings)}
          initial={remote.data.settings}
          pending={task.busy}
          error={task.error}
          submit={(value) =>
            void task.run(async () => {
              await webApi.fetch(`${root}/settings`, settingsResponse, {
                method: "PUT",
                json: v1.contracts.contractSettingsInputSchema.parse({
                  ...value,
                  logoAssetId: value.logoAssetId || null,
                }),
              });
              remote.reload();
            })
          }
        />
      ) : (
        <RemoteState error={remote.error} retry={remote.reload} />
      )}
    </details>
  );
}
function SettingsFields({
  initial,
  pending,
  error,
  submit,
}: {
  initial: v1.contracts.ContractSettings | null;
  pending: boolean;
  error: string | null;
  submit: (value: Record<string, string | number>) => void;
}) {
  const t = useTranslations("contracts");
  const action = useFormAction();
  const logoUpload = useTask();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploadedLogoName, setUploadedLogoName] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const logoUploading = useRef(false);
  const [value, setValue] = useState<Record<string, string | number>>(() =>
    Object.fromEntries(
      Object.entries(initial ?? {}).map(([key, value]) => [key, value ?? ""]),
    ),
  );
  async function uploadLogo() {
    if (!logoFile || pending || logoUpload.busy || logoUploading.current)
      return;
    logoUploading.current = true;
    try {
      await logoUpload.run(async () => {
        if (
          !["image/png", "image/jpeg"].includes(logoFile.type) ||
          logoFile.size > 8 * 1024 * 1024
        )
          throw new Error(t("settings.logoInvalid"));
        const body = new FormData();
        body.set("file", logoFile);
        const result = await webApi.fetch(
          `${root}/settings/logo`,
          v1.contracts.contractLogoUploadSchema,
          { method: "POST", body },
        );
        setValue((current) => ({ ...current, logoAssetId: result.assetId }));
        setUploadedLogoName(logoFile.name);
        setLogoFile(null);
        if (logoInput.current) logoInput.current.value = "";
      });
    } finally {
      logoUploading.current = false;
    }
  }
  return (
    <form
      className="mt-4 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && !logoUpload.busy && !logoUploading.current)
          submit(value);
      }}
    >
      <FormSection columns={1}>
        <Field>
          <FieldLabel htmlFor="contract-company-logo">
            {t("settings.logoUpload")}
          </FieldLabel>
          <Input
            ref={logoInput}
            id="contract-company-logo"
            type="file"
            accept="image/png,image/jpeg"
            disabled={pending || logoUpload.busy}
            onChange={(event) => {
              setLogoFile(event.target.files?.[0] ?? null);
              setUploadedLogoName(null);
            }}
          />
          <p className="text-sm text-muted-foreground">
            {t("settings.logoHint")}
          </p>
          {uploadedLogoName ? (
            <p role="status" className="text-sm">
              {t("settings.logoUploaded", { name: uploadedLogoName })}
            </p>
          ) : value.logoAssetId ? (
            <p className="text-sm">{t("settings.logoConfigured")}</p>
          ) : null}
          <Feedback error={logoUpload.error} />
          <SaveButton
            type="button"
            disabled={!logoFile || pending}
            state={
              logoUpload.busy ? "pending" : logoUpload.error ? "error" : "idle"
            }
            idleLabel={t("settings.uploadLogo")}
            pendingLabel={t("settings.uploadingLogo")}
            successLabel={t("settings.logoUploadComplete")}
            onClick={() => void uploadLogo()}
          />
        </Field>
        {Object.keys(v1.contracts.contractSettingsInputSchema.shape)
          .filter((key) => key !== "logoAssetId")
          .map((key) => (
            <Field key={key}>
              <FieldLabel htmlFor={`settings-${key}`}>
                {t(`settings.${key}`)}
              </FieldLabel>
              {[
                "selfieNotice",
                "signingAcceptanceText",
                "legalReviewStatement",
                "gpsHistoryStatement",
              ].includes(key) ? (
                <Textarea
                  id={`settings-${key}`}
                  required
                  value={value[key] ?? ""}
                  onChange={(e) =>
                    setValue({ ...value, [key]: e.target.value })
                  }
                  disabled={pending}
                />
              ) : (
                <Input
                  id={`settings-${key}`}
                  required={key !== "logoAssetId"}
                  type={
                    key.endsWith("Days")
                      ? "number"
                      : key === "email"
                        ? "email"
                        : "text"
                  }
                  value={value[key] ?? ""}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      [key]: key.endsWith("Days")
                        ? Number(e.target.value)
                        : e.target.value,
                    })
                  }
                  disabled={pending}
                />
              )}
            </Field>
          ))}
      </FormSection>
      <Feedback error={error} />
      <FormActions>
        <SaveButton
          type="submit"
          disabled={logoUpload.busy}
          {...action("save", { pending, error }, t("settings.save"))}
        />
      </FormActions>
    </form>
  );
}

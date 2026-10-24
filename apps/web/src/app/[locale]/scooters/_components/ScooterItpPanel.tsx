"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  FormActions,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { SaveButton } from "@repo/ui/components/save-button";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useOptionalSession } from "@/components/auth/SessionProvider";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import { useFormAction } from "@/lib/form/use-form-action";
import { ScooterFilePreview } from "./ScooterDocumentUpload";

type Values = {
  inspectionDate: string;
  validUntil: string;
  result: "passed" | "failed" | "unknown";
  certificateNumber: string;
  odometerKm: string;
  cardDocumentId: string;
  certificateDocumentId: string;
  reviewed: boolean;
};
const emptyValues: Values = {
  inspectionDate: "",
  validUntil: "",
  result: "unknown",
  certificateNumber: "",
  odometerKm: "",
  cardDocumentId: "",
  certificateDocumentId: "",
  reviewed: false,
};

export function documentHasItpType(
  document: v1.scooters.ScooterDocument,
  type: "itp_card" | "itp_certificate",
) {
  const logical = document.extractedData?.documents;
  return logical?.length
    ? logical.some((entry) => entry.documentType === type)
    : document.type === type;
}

function inspectionReadings(
  document: v1.scooters.ScooterDocument | undefined,
  type: "itp_card" | "itp_certificate",
) {
  return (
    document?.extractedData?.documents
      ?.filter((entry) => entry.documentType === type)
      .flatMap((entry) => entry.inspections ?? []) ?? []
  );
}

export function itpEvidenceDisagrees(
  card: v1.scooters.ScooterDocument | undefined,
  certificate: v1.scooters.ScooterDocument | undefined,
  inspectionDate: string,
  certificateNumber: string,
) {
  const cardRows = inspectionReadings(card, "itp_card");
  const certificateRows = inspectionReadings(
    certificate,
    "itp_certificate",
  ).filter((row) => row.inspectionDate === inspectionDate);
  return certificateRows.some((certificateRow) => {
    const matching = cardRows.filter(
      (row) =>
        row.inspectionDate === inspectionDate ||
        Boolean(
          certificateNumber &&
          row.certificateNumber?.toUpperCase() ===
            certificateNumber.toUpperCase(),
        ),
    );
    if (cardRows.length && !matching.length) return true;
    return matching.some((row) =>
      (["inspectionDate", "validUntil", "result"] as const).some(
        (key) =>
          row[key] && certificateRow[key] && row[key] !== certificateRow[key],
      ),
    );
  });
}

export function ScooterItpPanel({ scooter }: { scooter: v1.scooters.Scooter }) {
  const user = useOptionalSession()?.user;
  if (
    !canAccess(user, "scooters.read") ||
    !canAccess(user, "scooter_documents.read")
  )
    return null;
  return (
    <ItpPanelContent
      scooter={scooter}
      canWrite={!scooter.deletedAt && canAccess(user, "scooters.update")}
    />
  );
}

function ItpPanelContent({
  scooter,
  canWrite,
}: {
  scooter: v1.scooters.Scooter;
  canWrite: boolean;
}) {
  const t = useTranslations("scooters.itp");
  const locale = useLocale();
  const router = useRouter();
  const formAction = useFormAction();
  const prefix = useId();
  const [data, setData] = useState<v1.scooters.ScooterItpList>();
  const [loadError, setLoadError] = useState(false);
  const [values, setValues] = useState<Values>(emptyValues);
  const [pending, setPending] = useState(false);
  const submission = useRef(false);
  const historyVersion = useRef(0);
  const mounted = useRef(true);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);
  const [conflictIdentity, setConflictIdentity] = useState<string>();
  const identity = JSON.stringify([
    values.inspectionDate,
    values.cardDocumentId,
    values.certificateDocumentId,
  ]);
  const conflictBlocked = conflictIdentity === identity;
  const documents = scooter.documents ?? [];
  const cards = documents.filter((document) =>
    documentHasItpType(document, "itp_card"),
  );
  const certificates = documents.filter((document) =>
    documentHasItpType(document, "itp_certificate"),
  );
  const canConfirm = canWrite && cards.length > 0 && certificates.length > 0;
  const evidenceConflict = itpEvidenceDisagrees(
    documents.find((document) => document.id === values.cardDocumentId),
    documents.find((document) => document.id === values.certificateDocumentId),
    values.inspectionDate,
    values.certificateNumber,
  );

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const version = ++historyVersion.current;
    void webApi
      .fetch(
        v1.scooters.ROUTES.itp.list(scooter.id),
        v1.scooters.scooterItpListSchema,
        { signal: controller.signal, cache: "no-store" },
      )
      .then((history) => {
        if (!controller.signal.aborted && version === historyVersion.current)
          setData(history);
      })
      .catch(() => {
        if (!controller.signal.aborted && version === historyVersion.current)
          setLoadError(true);
      });
    return () => {
      controller.abort();
      mounted.current = false;
    };
  }, [scooter.id]);

  function update<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "reviewed" ? {} : { reviewed: false }),
    }));
    setSuccess(false);
    setError(undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submission.current || !canConfirm || success || conflictBlocked) return;
    const parsed = v1.scooters.scooterItpInputSchema.safeParse({
      inspectionDate: values.inspectionDate,
      validUntil: values.validUntil || null,
      result: values.result,
      certificateNumber: values.certificateNumber.trim() || null,
      odometerKm: values.odometerKm === "" ? null : Number(values.odometerKm),
      cardDocumentId: values.cardDocumentId,
      certificateDocumentId: values.certificateDocumentId,
      evidenceReviewed: values.reviewed,
    });
    if (!parsed.success) {
      setError(t("validation"));
      return;
    }
    submission.current = true;
    setPending(true);
    setError(undefined);
    try {
      const record = await webApi.fetch(
        v1.scooters.ROUTES.itp.create(scooter.id),
        v1.scooters.scooterItpInspectionSchema,
        { method: "POST", json: parsed.data },
      );
      const version = ++historyVersion.current;
      setData((previous) => {
        const inspections = [
          record,
          ...(previous?.inspections ?? []).filter(
            (entry) => entry.id !== record.id,
          ),
        ].sort(
          (a, b) =>
            b.inspectionDate.localeCompare(a.inspectionDate) ||
            b.createdAt.localeCompare(a.createdAt),
        );
        return { inspections, ...v1.scooters.scooterItpSummary(inspections) };
      });
      setSuccess(true);
      setLoadError(false);
      // Supersede the initial GET, then refresh authoritative history after commit.
      void webApi
        .fetch(
          v1.scooters.ROUTES.itp.list(scooter.id),
          v1.scooters.scooterItpListSchema,
          { cache: "no-store" },
        )
        .then((history) => {
          if (mounted.current && version === historyVersion.current)
            setData(history);
        })
        .catch(() => {
          if (mounted.current && version === historyVersion.current)
            setLoadError(true);
        });
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "ITP_RECORD_CONFLICT")
        setConflictIdentity(identity);
      setError(
        t(
          failure instanceof ApiError && failure.code === "ITP_VIN_MISMATCH"
            ? "vinMismatch"
            : failure instanceof ApiError &&
                failure.code === "ITP_RECORD_CONFLICT"
              ? "conflict"
              : "error",
        ),
      );
    } finally {
      submission.current = false;
      setPending(false);
    }
  }

  function documentSelect(
    key: "cardDocumentId" | "certificateDocumentId",
    label: "card" | "certificate",
    options: v1.scooters.ScooterDocument[],
  ) {
    return (
      <div className="grid min-w-0 gap-2">
        <Label htmlFor={`${prefix}-${key}`}>{t(label)}</Label>
        <Select
          value={values[key] || null}
          onValueChange={(value) => update(key, value ?? "")}
          disabled={pending}
        >
          <SelectTrigger id={`${prefix}-${key}`}>
            <SelectValue placeholder={t("choose")} />
          </SelectTrigger>
          <SelectContent>
            {options.map((document) => (
              <SelectItem key={document.id} value={document.id}>
                {document.fileName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        {data ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={data.status === "active" ? "success" : "warning"}>
              {t(`status.${data.status}`)}
            </Badge>
            {data.validUntil ? (
              <time dateTime={data.validUntil}>
                {new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(
                  new Date(`${data.validUntil}T00:00:00Z`),
                )}
              </time>
            ) : null}
          </div>
        ) : (
          <p
            role={loadError ? "alert" : "status"}
            className="text-sm text-muted-foreground"
          >
            {t(loadError ? "loadError" : "loading")}
          </p>
        )}
        {data && loadError ? (
          <p role="alert" className="text-sm text-warning">
            {t("loadError")}
          </p>
        ) : null}
        {data?.renewalRequired ? (
          <p className="text-sm text-warning">{t("renewal")}</p>
        ) : null}
        {canWrite ? (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() =>
              router.push(
                localizePath(
                  `/scooters/${encodeURIComponent(scooter.id)}/edit`,
                  resolveRouteLocale(locale),
                ),
              )
            }
          >
            {t("upload")}
          </Button>
        ) : null}
        {data?.inspections.length ? (
          <div className="grid gap-3" aria-label={t("history")}>
            {data.inspections.map((record) => (
              <div
                key={record.id}
                className="flex flex-wrap justify-between gap-2 border-b border-border pb-3 text-sm"
              >
                <span>
                  <time dateTime={record.inspectionDate}>
                    {record.inspectionDate}
                  </time>{" "}
                  · {record.certificateNumber ?? t("certificate")}
                </span>
                <span>
                  {t(record.result)}
                  {record.validUntil
                    ? ` · ${t("validUntil")}: ${record.validUntil}`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        ) : data ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : null}
        {canWrite && !canConfirm ? (
          <p className="text-sm text-muted-foreground">
            {t("missingEvidence")}
          </p>
        ) : null}
        {canConfirm ? (
          <form
            onSubmit={submit}
            className="grid gap-4"
            aria-label={t("add")}
            aria-busy={pending}
          >
            <p className="text-sm text-muted-foreground">{t("unverified")}</p>
            {evidenceConflict ? (
              <p role="alert" className="text-sm text-warning">
                {t("evidenceConflict")}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {certificates.flatMap(
                (document) =>
                  document.extractedData?.documents
                    ?.filter(
                      (entry) => entry.documentType === "itp_certificate",
                    )
                    .flatMap((entry) => entry.inspections ?? [])
                    .map((inspection, index) => (
                      <Button
                        key={`${document.id}-${index}`}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setValues({
                            ...emptyValues,
                            inspectionDate: inspection.inspectionDate ?? "",
                            validUntil: inspection.validUntil ?? "",
                            result: inspection.result ?? "unknown",
                            certificateNumber:
                              inspection.certificateNumber ?? "",
                            odometerKm:
                              inspection.odometerKm == null
                                ? ""
                                : String(inspection.odometerKm),
                            certificateDocumentId: document.id,
                            cardDocumentId:
                              cards.length === 1 ? cards[0]!.id : "",
                          });
                          setSuccess(false);
                          setError(undefined);
                        }}
                      >
                        {t("extracted", {
                          date: inspection.inspectionDate ?? "—",
                        })}
                      </Button>
                    )) ?? [],
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {documentSelect("cardDocumentId", "card", cards)}
              {documentSelect(
                "certificateDocumentId",
                "certificate",
                certificates,
              )}
              {(
                [
                  "inspectionDate",
                  "validUntil",
                  "certificateNumber",
                  "odometerKm",
                ] as const
              ).map((key) => (
                <div key={key} className="grid gap-2">
                  <Label htmlFor={`${prefix}-${key}`}>{t(key)}</Label>
                  <Input
                    id={`${prefix}-${key}`}
                    type={
                      key === "inspectionDate" || key === "validUntil"
                        ? "date"
                        : key === "odometerKm"
                          ? "number"
                          : "text"
                    }
                    min={key === "odometerKm" ? 0 : undefined}
                    required={key === "inspectionDate"}
                    value={values[key]}
                    onChange={(event) => update(key, event.target.value)}
                    disabled={pending}
                  />
                </div>
              ))}
              <div className="grid gap-2">
                <Label htmlFor={`${prefix}-result`}>{t("result")}</Label>
                <Select
                  value={values.result}
                  disabled={pending}
                  onValueChange={(value) =>
                    update("result", value ?? "unknown")
                  }
                >
                  <SelectTrigger id={`${prefix}-result`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["passed", "failed", "unknown"] as const).map((value) => (
                      <SelectItem value={value} key={value}>
                        {t(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {documents
                .filter(
                  (document) =>
                    document.id === values.cardDocumentId ||
                    document.id === values.certificateDocumentId,
                )
                .map((document) => (
                  <ScooterFilePreview
                    key={document.id}
                    document={document}
                    disabled={pending}
                  />
                ))}
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id={`${prefix}-reviewed`}
                checked={values.reviewed}
                onCheckedChange={(checked) => update("reviewed", checked)}
                disabled={pending}
              />
              <Label htmlFor={`${prefix}-reviewed`}>{t("reviewed")}</Label>
            </div>
            {error || conflictBlocked ? (
              <p
                id={`${prefix}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {conflictBlocked ? t("conflict") : error}
              </p>
            ) : null}
            <FormActions status={success ? t("saved") : undefined}>
              <SaveButton
                type="submit"
                {...formAction(
                  "confirm",
                  { pending, error, success },
                  t("save"),
                )}
                disabled={
                  conflictBlocked ||
                  !values.reviewed ||
                  !values.cardDocumentId ||
                  !values.certificateDocumentId
                }
                aria-describedby={
                  error || conflictBlocked ? `${prefix}-error` : undefined
                }
              />
            </FormActions>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

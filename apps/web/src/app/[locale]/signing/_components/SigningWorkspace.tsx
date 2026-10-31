"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { z } from "zod";
import { v1 } from "@repo/api-shared";
import { viewportSizing } from "@repo/theme";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  FieldLabel,
  FormActions,
  Textarea,
} from "@repo/ui/components";
import { PageLayout } from "@repo/ui/components/page-layout";
import { SaveButton } from "@repo/ui/components/save-button";
import { OTPField } from "@repo/ui/components/otp-field";
import { PdfPreview } from "@repo/ui/components/pdf-preview";
import { ImagePreview } from "@repo/ui/components/image-preview";
import { SignatureCapture } from "@repo/ui/components/signature-capture";
import {
  captureCameraFrame,
  useCaptureCamera,
} from "@repo/ui/hooks/use-capture-camera";
import { useObjectUrl } from "@repo/ui/hooks/use-object-url";
import { useFormatter, useTranslations } from "next-intl";
import { Feedback } from "@/components/WorkspaceForm";

/** Guest requests never use the account refresh adapter or browser token storage. */
export async function signingFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  json?: unknown,
  body?: FormData,
): Promise<T> {
  const response = await fetch(`/api/signing/${path}`, {
    method: json !== undefined || body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "x-requested-with": "fetch",
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body ?? (json !== undefined ? JSON.stringify(json) : undefined),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error =
      payload && typeof payload === "object"
        ? (payload as { message?: unknown; error?: { message?: unknown } })
        : {};
    throw new Error(
      typeof error.error?.message === "string"
        ? error.error.message
        : typeof error.message === "string"
          ? error.message
          : `Request failed (${response.status})`,
    );
  }
  return schema.parse(payload);
}

function useSigningTask() {
  const t = useTranslations("contracts");
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (error) {
      setError(error instanceof Error ? error.message : t("failed"));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}

export function SigningWorkspace() {
  const t = useTranslations("contracts");
  const task = useSigningTask();
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<v1.contracts.SigningState | null>(null);
  const refresh = useCallback(async () => {
    setState(await signingFetch("state", v1.contracts.signingStateSchema));
  }, []);
  useEffect(() => {
    let active = true;
    const readInvitation = () => {
      const url = new URL(window.location.href);
      const incoming =
        url.searchParams.get("token") ??
        new URLSearchParams(url.hash.slice(1)).get("token");
      if (incoming) {
        setToken(incoming);
        setLoaded(true);
      } else
        void refresh()
          .catch(() => {})
          .finally(() => {
            if (active) setLoaded(true);
          });
    };
    readInvitation();
    window.addEventListener("hashchange", readInvitation);
    window.addEventListener("popstate", readInvitation);
    return () => {
      active = false;
      window.removeEventListener("hashchange", readInvitation);
      window.removeEventListener("popstate", readInvitation);
    };
  }, [refresh]);
  async function exchange() {
    await task.run(async () => {
      const json = v1.contracts.exchangeInvitationInputSchema.parse({ token });
      const next = await signingFetch(
        "session",
        v1.contracts.signingStateSchema,
        json,
      );
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      url.hash = "";
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      setToken(null);
      setState(next);
    });
  }
  return (
    <PageLayout className="gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">{t("signing")}</h1>
        <p className="text-sm text-muted-foreground">{t("signingIntro")}</p>
      </header>
      <Feedback error={task.error} />
      {!loaded ? (
        <p role="status">{t("loading")}</p>
      ) : token ? (
        <SaveButton
          type="button"
          state={task.busy ? "pending" : task.error ? "error" : "idle"}
          idleLabel={t("start")}
          pendingLabel={t("pending")}
          successLabel={t("saved")}
          onClick={() => void exchange()}
        />
      ) : state ? (
        <SigningSession state={state} refresh={refresh} />
      ) : (
        <p role="alert">{t("expired")}</p>
      )}
    </PageLayout>
  );
}

function SigningSession({
  state,
  refresh,
}: {
  state: v1.contracts.SigningState;
  refresh: () => Promise<void>;
}) {
  const t = useTranslations("contracts");
  const task = useSigningTask();
  const [suspended, setSuspended] = useState(false);
  const firstUnsigned = state.documents.findIndex(
    (doc) =>
      !doc.signedAt || (doc.requiresLimiterSignature && !doc.limiterSignedAt),
  );
  const [selectedId, select] = useState<string | null>(null);
  const selected =
    state.documents.find((doc) => doc.id === selectedId) ??
    state.documents[Math.max(0, firstUnsigned)];
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        {state.phoneMasked} ·{" "}
        {state.phoneVerified ? t("phoneVerified") : t("code")}
      </p>
      {!state.phoneVerified ? (
        <SigningOtp purpose="phone" refresh={refresh} />
      ) : (
        <>
          <details open className="rounded-lg border p-4">
            <summary className="text-base font-semibold">
              {t("selfieDisclosure")}
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-sm">
              {state.selfieNotice}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {state.selfieNoticeVersion}
            </p>
          </details>
          {state.identityStatus !== "approved" && !state.customerCompletedAt ? (
            <SelfieCapture
              status={state.identityStatus}
              noticeVersion={state.selfieNoticeVersion}
              refresh={refresh}
            />
          ) : (
            <Badge variant="secondary">{t("identityApproved")}</Badge>
          )}
          {state.supportingFiles.length ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">
                {t("supportingFiles")}
              </h2>
              <ul className="flex flex-col gap-2 text-sm">
                {state.supportingFiles.map((file) => (
                  <li key={file.assetId}>
                    <a
                      href={`/api/signing/supporting-files/${file.assetId}/content`}
                      download
                      className="text-primary underline"
                    >
                      {t(file.category)} · {file.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {state.documents.length ? (
            <>
              <nav aria-label={t("documents")} className="flex flex-wrap gap-3">
                {state.documents.map((doc, index) => (
                  <Button
                    key={doc.id}
                    variant={selected?.id === doc.id ? "default" : "outline"}
                    onClick={() => select(doc.id)}
                  >
                    {index + 1}. {t(doc.type)} ·{" "}
                    {doc.signedAt
                      ? t(
                          doc.requiresLimiterSignature && !doc.limiterSignedAt
                            ? "limiterSignature"
                            : "statuses.signed",
                        )
                      : t(`statuses.${doc.status}`)}
                  </Button>
                ))}
              </nav>
              {selected ? (
                <SigningDocument
                  key={`${selected.id}-${selected.contentHash}-${selected.status}`}
                  document={selected}
                  canSign={
                    !suspended &&
                    state.identityStatus === "approved" &&
                    state.documents.indexOf(selected) === firstUnsigned
                  }
                  suspended={suspended}
                  completed={Boolean(state.customerCompletedAt)}
                  onSuspend={() => setSuspended(true)}
                  refresh={refresh}
                />
              ) : null}
              {state.customerCompletedAt ? (
                <div role="status" className="flex flex-col gap-3">
                  <h2 className="text-lg font-semibold">{t("completed")}</h2>
                  <p>{t("downloadCopies")}</p>
                  <ul className="flex flex-col gap-3">
                    {state.documents.map((doc) => (
                      <li key={doc.id}>
                        <a
                          href={`/api/signing/documents/${doc.id}/file?variant=${doc.signedHash ? "signed" : "presented"}`}
                          download
                          className="text-primary underline"
                        >
                          {t("download")} · {t(doc.type)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : firstUnsigned === -1 ? (
                <div className="flex flex-col gap-4">
                  {state.finalOtpRequired && !state.finalOtpVerified ? (
                    <>
                      <p>{t("finalOtpHint")}</p>
                      <SigningOtp purpose="final" refresh={refresh} />
                    </>
                  ) : (
                    <SaveButton
                      type="button"
                      state={
                        task.busy ? "pending" : task.error ? "error" : "idle"
                      }
                      idleLabel={t("complete")}
                      pendingLabel={t("pending")}
                      successLabel={t("completed")}
                      onClick={() =>
                        void task.run(async () => {
                          await signingFetch(
                            "complete",
                            v1.contracts.signingStateSchema,
                            {
                              manifestHash: state.manifestHash,
                              acceptance: true,
                            },
                          );
                          await refresh();
                        })
                      }
                    />
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <p>{t("noDocument")}</p>
          )}
        </>
      )}
      <Feedback error={task.error} />
      <Button
        variant="outline"
        disabled={task.busy}
        onClick={() => void task.run(refresh)}
      >
        {t("refresh")}
      </Button>
    </div>
  );
}

function SigningOtp({
  purpose,
  refresh,
}: {
  purpose: "phone" | "final";
  refresh: () => Promise<void>;
}) {
  const t = useTranslations("contracts");
  const task = useSigningTask();
  const [code, setCode] = useState("");
  async function verify(event: FormEvent) {
    event.preventDefault();
    await task.run(async () => {
      await signingFetch("otp/verify", v1.contracts.signingStateSchema, {
        code,
        purpose,
      });
      setCode("");
      await refresh();
    });
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={verify}>
      <Field>
        <FieldLabel>{t(purpose === "phone" ? "code" : "finalOtp")}</FieldLabel>
        <OTPField
          value={code}
          onValueChange={setCode}
          aria-label={t("code")}
          disabled={task.busy}
          invalid={Boolean(task.error)}
        />
      </Field>
      <Feedback error={task.error} />
      <FormActions>
        <SaveButton
          type="button"
          variant="outline"
          state={task.busy ? "pending" : "idle"}
          idleLabel={t("sendOtp")}
          pendingLabel={t("pending")}
          successLabel={t("saved")}
          onClick={() =>
            void task.run(async () => {
              await signingFetch(
                "otp/request",
                v1.contracts.signingStateSchema,
                { purpose },
              );
              setCode("");
            })
          }
        />
        <SaveButton
          type="submit"
          disabled={code.length !== 6}
          state={task.busy ? "pending" : task.error ? "error" : "idle"}
          idleLabel={t("verifyOtp")}
          pendingLabel={t("pending")}
          successLabel={t("phoneVerified")}
        />
      </FormActions>
    </form>
  );
}

function SelfieCapture({
  status,
  noticeVersion,
  refresh,
}: {
  status: string;
  noticeVersion: string;
  refresh: () => Promise<void>;
}) {
  const t = useTranslations("contracts");
  const photos = useTranslations("scooters.photos");
  const task = useSigningTask();
  const [capturing, setCapturing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const {
    videoRef,
    attachVideo,
    status: cameraStatus,
    markReady,
    markUnavailable,
    retry,
  } = useCaptureCamera(capturing, "user");
  const preview = useObjectUrl(file);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t("selfie")}</h2>
      <p className="text-sm text-muted-foreground">
        {t(status === "rejected" ? "identityRejected" : "manualReview")}
      </p>
      {capturing ? (
        <>
          <video
            ref={attachVideo}
            playsInline
            autoPlay
            muted
            className="max-h-96 w-full rounded-lg bg-muted object-contain"
            onLoadedMetadata={markReady}
            onCanPlay={markReady}
            onError={markUnavailable}
          />
          {cameraStatus === "unavailable" ? (
            <>
              <Feedback error={t("cameraUnavailable")} />
              <Button variant="outline" onClick={retry}>
                {t("retryCamera")}
              </Button>
            </>
          ) : (
            <Button
              disabled={cameraStatus !== "ready" || task.busy}
              onClick={() =>
                void task.run(async () => {
                  const value = await captureCameraFrame(videoRef.current!);
                  setFile(value);
                  setCapturing(false);
                })
              }
            >
              {t("capture")}
            </Button>
          )}
        </>
      ) : preview ? (
        <div className="flex h-96 flex-col overflow-hidden rounded-lg">
          <ImagePreview
            src={preview}
            alt={t("selfie")}
            loadingLabel={t("loading")}
            errorLabel={photos("imageFailed")}
            retryLabel={t("retry")}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={task.busy}
          onClick={() => {
            setFile(null);
            setCapturing(true);
          }}
        >
          {t(file ? "retake" : "capture")}
        </Button>
        {capturing ? (
          <Button variant="outline" onClick={() => setCapturing(false)}>
            {t("cancel")}
          </Button>
        ) : null}
      </div>
      {file ? (
        <SaveButton
          type="button"
          state={task.busy ? "pending" : task.error ? "error" : "idle"}
          idleLabel={t("usePhoto")}
          pendingLabel={t("pending")}
          successLabel={t("saved")}
          onClick={() =>
            void task.run(async () => {
              const body = new FormData();
              body.set("file", file);
              body.set("noticeVersion", noticeVersion);
              body.set("noticeAccepted", "true");
              await signingFetch(
                "selfie",
                v1.contracts.signingStateSchema,
                undefined,
                body,
              );
              setFile(null);
              await refresh();
            })
          }
        />
      ) : null}
      <Feedback error={task.error} />
    </section>
  );
}

type SigningDocumentType = v1.contracts.SigningState["documents"][number];
function SigningDocument({
  document,
  canSign,
  suspended,
  completed,
  onSuspend,
  refresh,
}: {
  document: SigningDocumentType;
  canSign: boolean;
  suspended: boolean;
  completed: boolean;
  onSuspend: () => void;
  refresh: () => Promise<void>;
}) {
  const t = useTranslations("contracts");
  const format = useFormatter();
  const viewerT = useTranslations("scooters.photos");
  const task = useSigningTask();
  const [reportedError, reportError] = useState("");
  const [endReached, setEndReached] = useState(false);
  const [pageText, setPageText] = useState("");
  const [accepted, accept] = useState(false);
  const [physical, setPhysical] = useState(false);
  const [signaturePng, signature] = useState<string | null>(null);
  const [limiterPng, limiterSignature] = useState<string | null>(null);
  const [limiterAccepted, limiterAccept] = useState(false);
  const telemetry = useRef(new Set<string>());
  const onPageRendered = useCallback(
    (page: number, total: number, text: string) => {
      setPageText(text);
      if (page === total) setEndReached(true);
      const event = page === total ? "document_end_reached" : "document_opened";
      if (!telemetry.current.has(event)) {
        telemetry.current.add(event);
        void fetch("/api/signing/telemetry", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-requested-with": "fetch",
          },
          body: JSON.stringify({ documentId: document.id, event }),
        }).catch(() => {});
      }
    },
    [document.id],
  );
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t(document.type)}</h2>
      <p className="break-all text-xs text-muted-foreground">
        {t("documentSha")}: {document.contentHash}
      </p>
      <div
        style={{ height: viewportSizing.documentReview }}
        className="flex min-h-96 flex-col overflow-hidden rounded-lg border bg-card"
      >
        <PdfPreview
          showCaption={false}
          src={`/api/signing/documents/${document.id}/file?variant=${document.signedHash ? "signed" : "presented"}`}
          label={t(document.type)}
          labels={{
            error: t("documentFailed"),
            previousPage: t("previousPage"),
            nextPage: t("nextPage"),
            retry: t("retry"),
          }}
          zoomLabels={{
            zoomIn: viewerT("zoomIn"),
            zoomOut: viewerT("zoomOut"),
            resetZoom: viewerT("resetZoom"),
          }}
          onPageRendered={onPageRendered}
        />
      </div>
      {pageText ? (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {t("accessibleText")}
          </summary>
          <p className="mt-3 whitespace-pre-wrap text-sm">{pageText}</p>
        </details>
      ) : null}
      {!document.signedAt ||
      (document.requiresLimiterSignature && !document.limiterSignedAt) ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t(endReached ? "reachedEnd" : "readToEnd")}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">{t("errorReport")}</p>
      {suspended ? (
        <Feedback success={t("signingSuspended")} />
      ) : !completed ? (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {t("reportError")}
          </summary>
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!reportedError.trim() || task.busy) return;
              void task.run(async () => {
                await signingFetch(
                  "telemetry",
                  v1.contracts.signingStateSchema,
                  {
                    documentId: document.id,
                    event: "error_reported",
                    message: reportedError,
                  },
                );
                onSuspend();
              });
            }}
          >
            <Field>
              <FieldLabel htmlFor={`report-${document.id}`}>
                {t("errorDescription")}
              </FieldLabel>
              <Textarea
                id={`report-${document.id}`}
                value={reportedError}
                onChange={(event) => reportError(event.target.value)}
                maxLength={2000}
                required
                disabled={task.busy}
              />
            </Field>
            <SaveButton
              type="submit"
              disabled={!reportedError.trim()}
              idleLabel={t("reportError")}
              pendingLabel={t("pending")}
              successLabel={t("saved")}
              state={task.busy ? "pending" : "idle"}
            />
          </form>
        </details>
      ) : null}
      {document.signedAt ? (
        <Badge variant="secondary">
          {t("signedAt", {
            date: format.dateTime(new Date(document.signedAt), {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: v1.rentals.RENTAL_POLICY.timezone,
            }),
          })}
        </Badge>
      ) : (
        <>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={accepted}
              disabled={!endReached || task.busy}
              onCheckedChange={(value) => accept(value === true)}
            />
            {document.acceptanceText}
          </label>
          {document.type === "TECHNICAL_HANDOVER" ? (
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={physical}
                disabled={task.busy}
                onCheckedChange={(value) => setPhysical(value === true)}
              />
              {t("received")}
            </label>
          ) : null}
          <SignatureCapture
            label={t("signature")}
            hint={t("signatureHint")}
            clearLabel={t("clearSignature")}
            onChange={signature}
            disabled={!canSign || !endReached || task.busy}
          />
          <FormActions>
            <SaveButton
              type="button"
              disabled={
                !canSign ||
                !endReached ||
                !accepted ||
                !document.acceptanceText ||
                !signaturePng ||
                (document.type === "TECHNICAL_HANDOVER" && !physical)
              }
              state={task.busy ? "pending" : task.error ? "error" : "idle"}
              idleLabel={t(
                document.type === "RENTAL_AGREEMENT" ? "signPayment" : "sign",
              )}
              pendingLabel={t("pending")}
              successLabel={t("signed")}
              onClick={() =>
                void task.run(async () => {
                  await signingFetch(
                    `documents/${document.id}/sign`,
                    v1.contracts.signingStateSchema,
                    {
                      contentHash: document.contentHash,
                      acceptance: true,
                      signaturePng,
                    },
                  );
                  await refresh();
                })
              }
            />
          </FormActions>
        </>
      )}
      {document.signedAt &&
      document.requiresLimiterSignature &&
      !document.limiterSignedAt ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-semibold">{t("limiterSignature")}</h3>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={limiterAccepted}
              disabled={!canSign || task.busy}
              onCheckedChange={(value) => limiterAccept(value === true)}
            />
            {document.limiterAcceptanceText}
          </label>
          <SignatureCapture
            label={t("limiterSignature")}
            hint={t("signatureHint")}
            clearLabel={t("clearSignature")}
            onChange={limiterSignature}
            disabled={!canSign || !endReached || task.busy}
          />
          <FormActions>
            <SaveButton
              type="button"
              disabled={
                !canSign ||
                !endReached ||
                !limiterAccepted ||
                !document.limiterAcceptanceText ||
                !limiterPng
              }
              state={task.busy ? "pending" : task.error ? "error" : "idle"}
              idleLabel={t("signLimiter")}
              pendingLabel={t("pending")}
              successLabel={t("signed")}
              onClick={() =>
                void task.run(async () => {
                  await signingFetch(
                    `documents/${document.id}/sign-limiter`,
                    v1.contracts.signingStateSchema,
                    {
                      contentHash: document.contentHash,
                      acceptance: true,
                      signaturePng: limiterPng,
                    },
                  );
                  await refresh();
                })
              }
            />
          </FormActions>
        </div>
      ) : null}
      <Feedback error={task.error} />
    </section>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@repo/ui/components";
import { useWorkspaceNotifications } from "./WorkspaceNotifications";
import { PageTitleOverride } from "./PageTitleOverride";
import { useTranslations } from "next-intl";

export function WorkspacePage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-w-0 flex-col gap-6 p-4 md:p-8">
      <PageTitleOverride title={title} />
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="max-w-(--breakpoint-md) text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </header>
      {children}
    </main>
  );
}

export function Choice({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

export function Feedback({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  if (!error && !success) return null;
  return (
    <Alert
      variant={error ? "destructive" : "default"}
      role={error ? "alert" : "status"}
    >
      <AlertDescription>{error || success}</AlertDescription>
    </Alert>
  );
}

export function useTask(errorMessages: Readonly<Record<string, string>> = {}) {
  const t = useTranslations("workspace");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notifications = useWorkspaceNotifications();
  const running = useRef(false);
  async function run(
    task: () => Promise<void | false>,
    feedback?: { successMessage: string },
  ) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);

    try {
      const result = await task();
      if (result !== false) {
        if (feedback?.successMessage)
          notifications?.add({
            title: feedback.successMessage,
            variant: "success",
          });
        window.dispatchEvent(new Event("access-changed"));
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code && errorMessages[cause.code]
          ? errorMessages[cause.code]
          : cause instanceof ApiError && cause.status === 409
            ? t("conflict")
            : cause instanceof Error
              ? cause.message
              : t("error"),
      );
      if (cause instanceof ApiError && [401, 403].includes(cause.status))
        window.dispatchEvent(new Event("access-changed"));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}

export function useRemote<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<{
    load: typeof load;
    version: number;
  } | null>(null);
  const loading = settled?.load !== load || settled?.version !== version;
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    load()
      .then((value) => {
        if (active) {
          setData(value);
          setError(null);
        }
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (active) setSettled({ load, version });
      });
    return () => {
      active = false;
    };
  }, [load, version]);
  return {
    data,
    error: loading ? null : error,
    reload,
    setData,
    loading,
    refreshing: loading && data !== null,
  };
}

export function RemoteState({
  error,
  retry,
}: {
  error?: string | null;
  retry: () => void;
}) {
  const t = useTranslations("workspace");
  return error ? (
    <div className="flex flex-col items-start gap-3">
      <Feedback error={error} />
      <Button variant="outline" onClick={retry}>
        {t("retry")}
      </Button>
    </div>
  ) : (
    <div aria-label={t("loading")} className="flex flex-col gap-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

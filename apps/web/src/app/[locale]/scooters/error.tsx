"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
} from "@repo/ui/components";
import { CircleAlertIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

interface ScootersErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ScootersError({ reset }: ScootersErrorProps) {
  const t = useTranslations("scooters");

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 px-6 py-10">
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>{t("routeStates.errorTitle")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-4">
          <p>{t("routeStates.errorDescription")}</p>
          <Button type="button" variant="outline" onClick={reset}>
            <RefreshCwIcon data-icon="inline-start" />
            {t("routeStates.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

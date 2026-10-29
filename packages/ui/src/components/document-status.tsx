import {
  Upload,
  CloudCheck,
  Clock3,
  Sparkles,
  CircleAlert,
  GitBranch,
  ClipboardCheck,
  FileWarning,
} from "lucide-react";
import { Spinner } from "./spinner";
import { cn } from "../lib/utils";

const states = {
  uploading: { icon: Upload, color: "text-info", busy: true },
  uploaded: { icon: CloudCheck, color: "text-scrim-foreground" },
  queued: { icon: Clock3, color: "text-scrim-foreground" },
  analyzing: { icon: Sparkles, color: "text-info", busy: true },
  analyzed: { icon: Sparkles, color: "text-success" },
  failed: { icon: CircleAlert, color: "text-destructive", alert: true },
  "needs-assignment": { icon: GitBranch, color: "text-warning" },
  "needs-review": { icon: ClipboardCheck, color: "text-warning" },
  "preview-unavailable": { icon: FileWarning, color: "text-warning" },
} as const;

export type DocumentStatusState = keyof typeof states;

/** Feature code supplies the actual state and localized label; this owns presentation only. */
export function DocumentStatus({
  state,
  label,
}: {
  state: DocumentStatusState;
  label: string;
}) {
  const config = states[state];
  const Icon = config.icon;
  const failed = "alert" in config;
  const iconOnly = ["uploading", "uploaded", "analyzing", "analyzed"].includes(
    state,
  );
  return (
    <p
      data-slot="document-status"
      data-state={state}
      role={failed ? "alert" : "status"}
      className={cn(
        "ml-auto flex min-w-0 self-end items-center justify-end gap-1 text-right text-xs wrap-anywhere text-scrim-foreground",
        failed && "rounded-md bg-destructive-subtle px-2 py-1 text-destructive",
      )}
    >
      <span className={iconOnly ? "sr-only" : undefined}>{label}</span>
      {"busy" in config ? <Spinner className="shrink-0" /> : null}
      <Icon
        aria-hidden="true"
        className={cn("size-4 shrink-0", config.color)}
      />
    </p>
  );
}

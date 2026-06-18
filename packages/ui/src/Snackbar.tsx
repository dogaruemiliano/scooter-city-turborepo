import type { ReactNode } from "react";

export type SnackbarPosition = "top" | "bottom";

export interface SnackbarProps {
  open: boolean;
  position?: SnackbarPosition;
  icon?: ReactNode;
  message: ReactNode;
  actions?: ReactNode;
  className?: string;
}

const positionClass: Record<SnackbarPosition, string> = {
  top: "top-0",
  bottom: "bottom-0",
};

export const Snackbar = ({
  open,
  position = "bottom",
  icon,
  message,
  actions,
  className,
}: SnackbarProps) => {
  if (!open) return null;

  return (
    <div
      role="status"
      className={[
        "fixed inset-x-0 z-toast p-4 flex justify-center",
        positionClass[position],
      ].join(" ")}
    >
      <div
        className={[
          "w-full max-w-2xl rounded-xl border border-border",
          "bg-card text-card-foreground shadow-xl",
          "flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {icon && (
          <div className="shrink-0 text-muted-foreground" aria-hidden="true">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0 text-sm">{message}</div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

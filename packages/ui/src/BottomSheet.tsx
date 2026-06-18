import { useEffect, type ReactNode } from "react";

export interface BottomSheetProps {
  open: boolean;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  backdrop?: boolean;
  className?: string;
}

export const BottomSheet = ({
  open,
  title,
  children,
  actions,
  onClose,
  backdrop = true,
  className,
}: BottomSheetProps) => {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed bottom-0 left-0 right-0 z-modal"
    >
      {backdrop && (
        <button
          type="button"
          aria-label="Close"
          tabIndex={-1}
          className="fixed inset-0 bg-scrim cursor-default backdrop-blur-sm"
          onClick={onClose}
        />
      )}
      <div className="relative p-4">
        <div
          className={[
            "mx-auto max-w-2xl rounded-xl border border-border",
            "bg-card text-card-foreground shadow-xl p-4",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {title && <h3 className="text-base font-semibold mb-4">{title}</h3>}
          <div>{children}</div>
          {actions && (
            <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

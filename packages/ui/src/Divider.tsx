import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export type DividerOrientation = "horizontal" | "vertical";

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: DividerOrientation;
  children?: ReactNode;
}

export const Divider = forwardRef<HTMLDivElement, DividerProps>(
  ({ orientation = "horizontal", children, className, ...rest }, ref) => {
    const hasLabel = children !== undefined && children !== null;
    const isHorizontal = orientation === "horizontal";

    if (!hasLabel) {
      return (
        <div
          ref={ref}
          role="separator"
          aria-orientation={orientation}
          className={[
            isHorizontal
              ? "w-full border-t border-border"
              : "h-full border-l border-border",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />
      );
    }

    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation={orientation}
        className={[
          isHorizontal
            ? "flex w-full items-center gap-3"
            : "flex h-full flex-col items-center gap-3",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        <span
          aria-hidden
          className={
            isHorizontal
              ? "flex-1 border-t border-border"
              : "flex-1 border-l border-border"
          }
        />
        <span className="text-sm text-muted-foreground">{children}</span>
        <span
          aria-hidden
          className={
            isHorizontal
              ? "flex-1 border-t border-border"
              : "flex-1 border-l border-border"
          }
        />
      </div>
    );
  },
);

Divider.displayName = "Divider";

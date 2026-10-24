"use client";

import {
  useEffect,
  useRef,
  useState,
  useId,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "@repo/ui/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Label } from "./label";
import { InputGroup, InputGroupTextarea } from "./input-group";
import { CircleCheck, RotateCcw, Send } from "lucide-react";
import { breakpoints } from "@repo/theme";
import { SaveButton, type SaveButtonProps } from "./save-button";

/** A conversation surface. Data fetching, ordering and pagination belong to the caller. */
function CommentThread({
  title,
  children,
  empty,
  composer,
  className,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  title: string;
  empty?: ReactNode;
  composer?: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      data-slot="comment-thread"
      aria-labelledby={headingId}
      className={cn(
        "flex min-w-0 flex-col gap-6 border-t border-border pt-6",
        className,
      )}
      {...props}
    >
      <h3 id={headingId} className="text-base font-semibold">
        {title}
      </h3>
      {children ?? <p className="text-sm text-muted-foreground">{empty}</p>}
      {composer}
    </section>
  );
}

function CommentItem({
  marker,
  context,
  animateEntrance = false,
  author,
  avatarUrl,
  dateTime,
  timestamp,
  children,
  className,
  ...props
}: ComponentProps<"li"> & {
  marker?: ReactNode;
  context?: ReactNode;
  /** Animate only a newly posted item; existing history stays still. */
  animateEntrance?: boolean;
  author: string;
  avatarUrl?: string;
  dateTime: string;
  timestamp: string;
}) {
  const initials = author
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return (
    <li
      data-slot="comment-item"
      className={cn(
        "flex min-w-0 gap-3",
        animateEntrance &&
          "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-normal motion-safe:ease-decelerate motion-reduce:animate-none",
        className,
      )}
      {...props}
    >
      {marker ?? (
        <Avatar aria-hidden="true">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      )}
      <article className="flex min-w-0 flex-1 flex-col gap-2">
        {context}
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold wrap-anywhere">{author}</span>
          <time dateTime={dateTime} className="text-xs text-muted-foreground">
            {timestamp}
          </time>
        </header>
        <div className="whitespace-pre-wrap text-sm leading-relaxed wrap-anywhere">
          {children}
        </div>
      </article>
    </li>
  );
}

/** A message attached to a completed or reopened task, distinct from ordinary discussion. */
function CommentEventItem({
  kind,
  label,
  ...props
}: Omit<ComponentProps<typeof CommentItem>, "marker" | "context"> & {
  kind: "completed" | "reopened";
  label: string;
}) {
  const Icon = kind === "completed" ? CircleCheck : RotateCcw;
  const tone = kind === "completed" ? "text-success" : "text-warning";
  return (
    <CommentItem
      {...props}
      className={cn(
        "rounded-xl p-4",
        kind === "completed" ? "bg-success-subtle" : "bg-warning-subtle",
        props.className,
      )}
      marker={
        <span
          aria-hidden="true"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full bg-background [&_svg]:size-4",
            tone,
          )}
        >
          <Icon />
        </span>
      }
      context={<p className="text-sm font-semibold text-foreground">{label}</p>}
    />
  );
}

type CommentComposerProps = Omit<ComponentProps<"form">, "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  error?: ReactNode;
  recovery?: ReactNode;
  submitButton: Pick<
    SaveButtonProps,
    "state" | "idleLabel" | "pendingLabel" | "successLabel"
  >;
};

/** Controlled form: the caller owns the request, error recovery and clearing the draft. */
function CommentComposer({
  value,
  onValueChange,
  label,
  placeholder,
  maxLength,
  disabled,
  error,
  recovery,
  submitButton,
  onSubmit,
  className,
  ...props
}: CommentComposerProps) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [focused, setFocused] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState<number | null>(null);
  const [reservedHeight, setReservedHeight] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!focused || !viewport) {
      setKeyboardInset(null);
      return;
    }
    const initialHeight = window.innerHeight;
    const update = () => {
      const inset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      setKeyboardInset(
        window.innerWidth < breakpoints.md &&
          viewport.scale === 1 &&
          (inset > 0 || viewport.height < initialHeight)
          ? inset
          : null,
      );
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [focused]);
  useEffect(() => {
    const form = formRef.current;
    if (!form || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setReservedHeight(form.getBoundingClientRect().height),
    );
    observer.observe(form);
    return () => observer.disconnect();
  }, []);
  const pending = submitButton.state === "pending";
  const blocked = disabled || pending || submitButton.state === "success";
  return (
    <div
      style={keyboardInset !== null ? { height: reservedHeight } : undefined}
    >
      <form
        ref={formRef}
        data-slot="comment-composer"
        data-keyboard-docked={keyboardInset !== null || undefined}
        style={keyboardInset !== null ? { bottom: keyboardInset } : undefined}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocused(false);
        }}
        aria-busy={pending || undefined}
        className={cn(
          "flex min-w-0 flex-col gap-3",
          keyboardInset !== null &&
            "fixed inset-x-0 z-sticky bg-background px-4 py-2",
          className,
        )}
        {...props}
        onSubmit={(event) => {
          if (blocked || !value.trim()) {
            event.preventDefault();
            return;
          }
          onSubmit?.(event);
        }}
      >
        <Label className="sr-only" htmlFor={id}>
          {label}
        </Label>
        <InputGroup className="h-auto items-end gap-1 rounded-3xl p-1 md:h-auto">
          <InputGroupTextarea
            id={id}
            rows={1}
            autoResize
            className="min-h-10 max-h-36 resize-none overflow-y-auto px-3 py-2 text-base leading-6 md:min-h-10 md:py-2 md:text-sm"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            required
            disabled={blocked}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <SaveButton
            type="submit"
            iconOnly
            icon={<Send aria-hidden="true" />}
            className="size-11 min-h-11 min-w-11"
            onMouseDown={(event) => event.preventDefault()}
            disabled={blocked || !value.trim()}
            {...submitButton}
          />
        </InputGroup>
        {error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        {recovery}
      </form>
    </div>
  );
}

export {
  CommentThread,
  CommentItem,
  CommentEventItem,
  CommentComposer,
  type CommentComposerProps,
};

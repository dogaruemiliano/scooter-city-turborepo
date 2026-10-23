"use client";

import { UserPlusIcon, XIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion } from "@repo/theme";
import { Button, SheetSelect } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { Feedback } from "@/components/WorkspaceForm";
import { memberName } from "../_lib/member-name";
import { AssigneeUserCard } from "./AssigneeUserCard";

function AssigneePresence({
  id,
  present,
  onExited,
  children,
}: {
  id: string;
  present: boolean;
  onExited: (id: string) => void;
  children: ReactNode;
}) {
  const [leaving, setLeaving] = useState(false);
  if (present && leaving) setLeaving(false);
  useEffect(() => {
    if (present) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onExited(id);
      return;
    }
    const windup = window.setTimeout(
      () => setLeaving(true),
      motion.duration.removalWindup,
    );
    const timer = window.setTimeout(
      () => onExited(id),
      motion.duration.removalWindup + motion.duration.normal,
    );
    return () => {
      window.clearTimeout(windup);
      window.clearTimeout(timer);
    };
  }, [id, present, onExited]);
  return (
    <div
      data-slot="assignee-presence"
      data-exiting={!present || undefined}
      data-removal-phase={present ? undefined : leaving ? "leaving" : "windup"}
      aria-hidden={!present || undefined}
      inert={!present}
      className={`grid transition-[grid-template-rows] duration-normal ease-standard motion-reduce:transition-none ${leaving ? "grid-rows-[0fr]" : "grid-rows-[1fr]"} ${!present ? "pointer-events-none" : ""}`}
    >
      <div className="min-h-0 overflow-visible">
        <div
          style={
            leaving
              ? {
                  transitionDuration: `${motion.duration.normal}ms, ${motion.duration.removalWindup}ms`,
                  transitionTimingFunction: motion.easing.decelerate,
                }
              : undefined
          }
          className={`relative pb-2 transition-[translate,opacity] motion-reduce:translate-none motion-reduce:transition-none ${present ? "translate-x-0 opacity-100 duration-fast ease-decelerate" : leaving ? "z-raised -translate-x-12 opacity-0" : "z-raised translate-x-1.5 opacity-100 duration-removal-windup ease-decelerate"}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export type AssigneeOption = {
  id: string;
  email?: string;
  firstName: string | null;
  lastName: string | null;
  roles?: readonly string[];
  isSuperAdmin?: boolean;
};

type AssigneeSelectProps = {
  members: readonly AssigneeOption[];
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  includeUnassigned?: boolean;
  onClear?: () => void;
  clearOptionLabel?: string;
} & (
  | { multiple?: false; value: string; onValueChange: (id: string) => void }
  | { multiple: true; value: string[]; onValueChange: (ids: string[]) => void }
);

/** Shared assignee cards for problem creation and multi-select filters. */
export function AssigneeSelect(props: AssigneeSelectProps) {
  const t = useTranslations("workspace");
  const selected = props.multiple
    ? props.value
    : props.value
      ? [props.value]
      : [];
  const options = [
    ...(props.includeUnassigned
      ? [{ value: "unassigned", label: t("problems.unassigned") }]
      : []),
    ...props.members.map((member) => ({
      value: member.id,
      label: memberName(member),
      keywords: [member.email ?? ""],
    })),
  ];
  const control = props.multiple
    ? {
        multiple: true as const,
        value: props.value,
        onValueChange: props.onValueChange,
      }
    : {
        multiple: false as const,
        value: props.value,
        onValueChange: props.onValueChange,
      };
  const action = t("problems.addAssignee");
  const container = useRef<HTMLDivElement>(null);
  const currentCards = selected.flatMap((id) => {
    const option = options.find((option) => option.value === id);
    return option ? [{ id, label: option.label, present: true }] : [];
  });
  const signature = JSON.stringify(currentCards);
  const [previousSignature, setPreviousSignature] = useState(signature);
  const [cards, setCards] = useState(currentCards);
  if (previousSignature !== signature) {
    setPreviousSignature(signature);
    setCards([
      ...cards.map(
        (card) =>
          currentCards.find((item) => item.id === card.id) ?? {
            ...card,
            present: false,
          },
      ),
      ...currentCards.filter(
        (card) => !cards.some((item) => item.id === card.id),
      ),
    ]);
  }
  const finishExit = useCallback((id: string) => {
    setCards((cards) => cards.filter((card) => card.id !== id || card.present));
  }, []);
  return (
    <div ref={container} className="flex flex-col">
      {cards.map(({ id, label, present }) => {
        return (
          <AssigneePresence
            key={id}
            id={id}
            present={present}
            onExited={finishExit}
          >
            <div className="flex items-center rounded-2xl border border-border bg-card p-4 text-card-foreground">
              <AssigneeUserCard
                member={props.members.find((member) => member.id === id)}
                name={label}
                action={
                  <Button
                    type="button"
                    variant="secondary-destructive"
                    size="icon"
                    disabled={props.disabled}
                    data-assignee-remove=""
                    aria-label={t("problems.removeAssignee", {
                      name: label,
                    })}
                    onClick={(event) => {
                      const buttons = Array.from(
                        container.current?.querySelectorAll<HTMLButtonElement>(
                          "[data-assignee-remove]",
                        ) ?? [],
                      ).filter((button) => !button.closest("[inert]"));
                      const index = buttons.indexOf(event.currentTarget);
                      const next =
                        buttons[index + 1] ??
                        buttons[index - 1] ??
                        container.current?.querySelector<HTMLButtonElement>(
                          "[data-slot='add-action']",
                        );
                      next?.focus();
                      if (props.multiple)
                        props.onValueChange(
                          props.value.filter((value) => value !== id),
                        );
                      else props.onValueChange("");
                    }}
                  >
                    <XIcon aria-hidden="true" className="size-5" />
                  </Button>
                }
              />
            </div>
          </AssigneePresence>
        );
      })}
      <SheetSelect
        {...control}
        label={props.label ?? action}
        disabled={props.disabled}
        addAction={{ text: action, icon: <UserPlusIcon /> }}
        onClear={props.onClear}
        clearOptionLabel={props.clearOptionLabel}
        searchPlaceholder={t("problems.searchAssignees")}
        clearSearchLabel={t("problems.clearAssigneeSearch")}
        closeLabel={t("done")}
        emptyMessage={
          props.loading
            ? t("loading")
            : (props.error ?? t("problems.noAssignees"))
        }
        renderHeaderAction={
          props.error && props.onRetry
            ? () => (
                <Button type="button" variant="outline" onClick={props.onRetry}>
                  {t("retry")}
                </Button>
              )
            : undefined
        }
        options={options}
        renderOption={(option) => (
          <AssigneeUserCard
            showEmail={false}
            member={props.members.find((member) => member.id === option.value)}
            name={option.label}
          />
        )}
      />
      <Feedback error={props.error} />
    </div>
  );
}

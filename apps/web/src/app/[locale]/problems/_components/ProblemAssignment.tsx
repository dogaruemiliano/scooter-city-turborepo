"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import {
  Button,
  Input,
  PersonRow,
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetBody,
  BottomSheetFooter,
} from "@repo/ui/components";
import { CheckIcon } from "lucide-react";
import type { AssigneeOption } from "./AssigneeSelect";
import { memberName } from "../_lib/member-name";

export function ProblemAssignment({
  problem,
  userId,
  mayAssign,
  mayClaim,
  busy,
  members,
  loading,
  error,
  onRetry,
  onAssign,
  onClaim,
  saveError,
}: {
  problem: v1.problems.Problem;
  userId?: string;
  mayAssign: boolean;
  mayClaim: boolean;
  busy: boolean;
  members: readonly AssigneeOption[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onAssign: (ids: string[]) => Promise<boolean>;
  saveError: string | null;
  onClaim: () => void;
}) {
  const t = useTranslations("workspace");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const assigned = v1.problems.problemAssignees(problem);
  const editable =
    problem.status === "open" || problem.status === "in_progress";
  const options = [
    ...members,
    ...assigned.filter(
      (person) => !members.some((member) => member.id === person.id),
    ),
  ];
  const filtered = options
    .filter((member) =>
      `${memberName(member)} ${member.email ?? ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    )
    .sort(
      (a, b) => Number(draft.includes(b.id)) - Number(draft.includes(a.id)),
    );
  const action = t(
    assigned.length ? "problems.manageAssignment" : "problems.assignSomeone",
  );
  return (
    <section
      aria-label={t("problems.assignment")}
      className="flex flex-col gap-4 rounded-xl border border-border p-4"
    >
      <h3 className="text-base font-semibold">{t("problems.assignment")}</h3>
      {assigned.length ? (
        assigned.map((member) => (
          <PersonRow
            key={member.id}
            name={memberName(member)}
            action={
              member.id === userId ? (
                <span className="text-sm font-medium text-muted-foreground">
                  {t("problems.you")}
                </span>
              ) : undefined
            }
          />
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("problems.nobodyAssigned")}
        </p>
      )}
      {problem.assigneeNeedsReassignment ? (
        <p role="status" className="text-sm font-medium text-destructive">
          {t("problems.reassignRequired")}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        {mayAssign && editable ? (
          <Button
            disabled={busy}
            variant={assigned.length ? "outline" : "default"}
            onClick={() => {
              setDraft(assigned.map((member) => member.id));
              setQuery("");
              setOpen(true);
            }}
          >
            {action}
          </Button>
        ) : null}
        {mayClaim && problem.status === "open" && !assigned.length ? (
          <Button
            disabled={busy}
            variant={mayAssign ? "outline" : "default"}
            onClick={onClaim}
          >
            {t(mayAssign ? "problems.assignToMe" : "problems.takeProblem")}
          </Button>
        ) : null}
      </div>
      <BottomSheet
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <BottomSheetContent className="bg-popover text-popover-foreground">
          <BottomSheetHeader>
            <BottomSheetTitle>{action}</BottomSheetTitle>
          </BottomSheetHeader>
          <BottomSheetBody className="flex flex-col gap-3">
            <Input
              aria-label={t("problems.searchAssignees")}
              placeholder={t("problems.searchAssignees")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {loading ? <p role="status">{t("loading")}</p> : null}
            {error ? (
              <div>
                <p role="alert">{error}</p>
                <Button variant="outline" onClick={onRetry}>
                  {t("retry")}
                </Button>
              </div>
            ) : null}
            {!loading && !error && !filtered.length ? (
              <p className="text-sm text-muted-foreground">
                {t("problems.noAssignees")}
              </p>
            ) : null}
            {filtered.map((member) => (
              <Button
                key={member.id}
                variant="outline"
                className="h-auto justify-start p-3"
                aria-label={memberName(member)}
                aria-pressed={draft.includes(member.id)}
                disabled={busy}
                onClick={() =>
                  setDraft((ids) =>
                    ids.includes(member.id)
                      ? ids.filter((id) => id !== member.id)
                      : [...ids, member.id],
                  )
                }
              >
                <PersonRow
                  name={memberName(member)}
                  action={
                    draft.includes(member.id) ? (
                      <CheckIcon aria-hidden="true" />
                    ) : undefined
                  }
                />
              </Button>
            ))}
          </BottomSheetBody>
          <BottomSheetFooter>
            {saveError ? (
              <p role="alert" className="text-sm text-destructive">
                {saveError}
              </p>
            ) : null}
            <Button
              disabled={busy || loading || Boolean(error)}
              onClick={async () => {
                if (await onAssign(draft)) setOpen(false);
              }}
            >
              {t("problems.applyAssignment")}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>
    </section>
  );
}

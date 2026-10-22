"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetBody,
  Button,
  AddAction,
  Checkbox,
  Input,
  Label,
  SheetSelect,
} from "@repo/ui/components";
import {
  ClipboardList,
  MapPin,
  Pencil,
  Plus,
  ShoppingCart,
} from "lucide-react";
import { Feedback, useRemote, useTask } from "@/components/WorkspaceForm";
import { webApi } from "@/lib/api";
import { SectionDeleteAction } from "./SectionDeleteAction";
import { ProblemChecklist } from "./ProblemChecklist";

export type ProblemSectionData = Pick<
  v1.problems.Problem,
  "sections" | "checklist" | "buyList" | "location"
>;

type Section = v1.problems.Problem["sections"][number];

export function ProblemSections({
  problem,
  editable,
  maySaveLocation,
  busy,
  onSave,
  onBusyChange,
}: {
  problem: ProblemSectionData;
  editable: boolean;
  maySaveLocation: boolean;
  busy: boolean;
  onSave: (
    input: Omit<v1.problems.UpdateProblemInput, "revision">,
  ) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const t = useTranslations("workspace.problems");
  const shared = useTranslations("workspace");
  const task = useTask();
  const [open, setOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [creatingChecklist, setCreatingChecklist] = useState<
    "checklist" | "buyList" | null
  >(null);
  const has = (section: Section) =>
    section === "checklist" || section === "buyList"
      ? problem[section].length > 0
      : problem.sections.includes(section) ||
        (section === "location" && problem.location !== null);
  useEffect(() => {
    onBusyChange(task.busy);
    return () => onBusyChange(false);
  }, [task.busy, onBusyChange]);
  const options = [
    { key: "checklist", Icon: ClipboardList },
    { key: "buyList", Icon: ShoppingCart },
    { key: "location", Icon: MapPin },
  ] as const;
  return (
    <>
      <Feedback error={task.error} />
      {(["checklist", "buyList"] as const).map((kind) =>
        has(kind) || creatingChecklist === kind ? (
          <ProblemChecklist
            key={kind}
            kind={kind}
            initialOpen={creatingChecklist === kind && !has(kind)}
            onEditorClose={() => setCreatingChecklist(null)}
            problem={problem}
            editable={editable}
            busy={busy}
            error={task.error}
            onSave={async (items) => {
              let saved = false;
              await task.run(async () => {
                await onSave({
                  [kind]: items,
                  ...(!items.length
                    ? {
                        sections: problem.sections.filter(
                          (section) => section !== kind,
                        ),
                      }
                    : !has(kind) && !problem.sections.includes(kind)
                      ? { sections: [...problem.sections, kind] }
                      : {}),
                });
                setCreatingChecklist(null);
                saved = true;
              });
              return saved;
            }}
          />
        ) : null,
      )}
      {has("location") ? (
        <section className="flex flex-col gap-3" aria-label={t("location")}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              {t("location")}
              <MapPin aria-hidden="true" className="size-4 shrink-0" />
            </h3>
            {editable && problem.location ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("editLocation")}
                disabled={busy}
                onClick={() => setEditingLocation(true)}
              >
                <Pencil aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          {problem.location ? (
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground">
              <div className="min-w-0 flex-1">
                <p className="font-medium wrap-anywhere">
                  {problem.location.name}
                </p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground wrap-anywhere">
                  {problem.location.address}
                </p>
              </div>
            </div>
          ) : null}
          {editable && !problem.location ? (
            <AddAction
              text={t("addLocation")}
              icon={<MapPin />}
              disabled={busy}
              onClick={() => setEditingLocation(true)}
            />
          ) : null}
        </section>
      ) : null}
      {editable && options.some(({ key }) => !has(key)) ? (
        <AddAction
          text={t("addSection")}
          icon={<Plus />}
          subtext={t("addSectionDescription")}
          disabled={busy}
          onClick={() => setOpen(true)}
        />
      ) : null}
      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetContent>
          <BottomSheetHeader>
            <BottomSheetTitle>{t("addToTask")}</BottomSheetTitle>
            <BottomSheetDescription>
              {t("addToTaskDescription")}
            </BottomSheetDescription>
          </BottomSheetHeader>
          <BottomSheetBody className="gap-3">
            {options.map(({ key, Icon }) => (
              <Button
                key={key}
                variant="outline"
                className="justify-start"
                disabled={busy || has(key)}
                onClick={() => {
                  if (key === "location") {
                    setOpen(false);
                    setEditingLocation(true);
                  } else {
                    setOpen(false);
                    setCreatingChecklist(key);
                  }
                }}
              >
                <Icon aria-hidden="true" />
                {t(key)}
              </Button>
            ))}
            <Feedback error={task.error} />
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {shared("cancel")}
            </Button>
          </BottomSheetBody>
        </BottomSheetContent>
      </BottomSheet>
      {editingLocation ? (
        <TaskLocationEditor
          problem={problem}
          maySaveLocation={maySaveLocation}
          busy={busy}
          onClose={() => setEditingLocation(false)}
          onDelete={async () => {
            await onSave({
              location: null,
              sections: problem.sections.filter(
                (section) => section !== "location",
              ),
            });
            setEditingLocation(false);
          }}
          onSave={async (location) => {
            await onSave({
              location,
              sections: has("location")
                ? problem.sections
                : [...problem.sections, "location"],
            });
            setEditingLocation(false);
          }}
          onBusyChange={onBusyChange}
        />
      ) : null}
    </>
  );
}

function TaskLocationEditor({
  problem,
  maySaveLocation,
  busy,
  onClose,
  onSave,
  onDelete,
  onBusyChange,
}: {
  problem: ProblemSectionData;
  maySaveLocation: boolean;
  busy: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onSave: (
    location: NonNullable<v1.problems.Problem["location"]>,
  ) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const t = useTranslations("workspace.problems");
  const shared = useTranslations("workspace");
  const id = useId();
  const task = useTask();
  const [name, setName] = useState(problem.location?.name ?? "");
  const [address, setAddress] = useState(problem.location?.address ?? "");
  const [savedId, setSavedId] = useState<string | null>(
    problem.location?.savedLocationId ?? null,
  );
  const [saveForReuse, setSaveForReuse] = useState(false);
  const locations = useRemote(
    useCallback(
      () =>
        webApi.fetch(
          "/v1/problems/locations",
          v1.problems.businessLocationListSchema,
        ),
      [],
    ),
  );
  useEffect(() => {
    onBusyChange(task.busy);
    return () => onBusyChange(false);
  }, [task.busy, onBusyChange]);
  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (!open && !task.busy) onClose();
      }}
      dismissible={!task.busy}
    >
      <BottomSheetContent>
        <BottomSheetHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <BottomSheetTitle>
                {t(problem.location ? "editLocation" : "addLocation")}
              </BottomSheetTitle>
              <BottomSheetDescription>
                {t("locationDescription")}
              </BottomSheetDescription>
            </div>
            {problem.location ? (
              <SectionDeleteAction
                kind="location"
                busy={busy || task.busy}
                onDelete={onDelete}
              />
            ) : null}
          </div>
        </BottomSheetHeader>
        <BottomSheetBody className="gap-4">
          <Feedback error={locations.error} />
          {locations.error ? (
            <Button variant="outline" onClick={locations.reload}>
              {shared("retry")}
            </Button>
          ) : null}
          <SheetSelect
            label={t("savedLocation")}
            value={savedId}
            disabled={busy || locations.loading}
            options={(locations.data?.items ?? []).map((location) => ({
              value: location.id,
              label: `${location.name} · ${location.address}`,
            }))}
            placeholder={t("chooseSavedLocation")}
            searchPlaceholder={t("searchLocations")}
            closeLabel={shared("cancel")}
            emptyMessage={t("noSavedLocations")}
            onValueChange={(value) => {
              const location = locations.data?.items.find(
                (item) => item.id === value,
              );
              if (location) {
                setSavedId(location.id);
                setName(location.name);
                setAddress(location.address);
                setSaveForReuse(false);
              }
            }}
          />
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (busy || !name.trim() || !address.trim()) return;
              void task.run(async () => {
                const location = {
                  name: name.trim(),
                  address: address.trim(),
                  savedLocationId: savedId,
                };
                if (saveForReuse && maySaveLocation && !savedId) {
                  const saved = await webApi.fetch(
                    "/v1/problems/locations",
                    v1.problems.businessLocationSchema,
                    {
                      method: "POST",
                      json: { name: location.name, address: location.address },
                    },
                  );
                  location.savedLocationId = saved.id;
                }
                await onSave(location);
              });
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-name`}>{t("locationName")}</Label>
              <Input
                id={`${id}-name`}
                required
                maxLength={160}
                value={name}
                disabled={busy}
                onChange={(event) => {
                  setName(event.target.value);
                  setSavedId(null);
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-address`}>{t("locationAddress")}</Label>
              <Input
                id={`${id}-address`}
                required
                maxLength={500}
                value={address}
                disabled={busy}
                onChange={(event) => {
                  setAddress(event.target.value);
                  setSavedId(null);
                }}
              />
            </div>
            {maySaveLocation && !savedId ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-reuse`}
                  checked={saveForReuse}
                  disabled={busy}
                  onCheckedChange={setSaveForReuse}
                />
                <Label htmlFor={`${id}-reuse`}>
                  {t("saveLocationForReuse")}
                </Label>
              </div>
            ) : null}
            <Feedback error={task.error} />
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={busy || !name.trim() || !address.trim()}
              >
                {t("saveLocation")}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={onClose}>
                {shared("cancel")}
              </Button>
            </div>
          </form>
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheet>
  );
}

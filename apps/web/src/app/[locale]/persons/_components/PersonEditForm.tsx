"use client";

import { PageLayout } from "@repo/ui/components/page-layout";
import {
  ProfilePictureEditor,
  type ProfilePictureChange,
} from "@/components/ProfilePictureEditor";
import { FormActions } from "@repo/ui/components/form-actions";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormSection,
} from "@repo/ui/components";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider } from "react-hook-form";

import {
  FormCountrySelect,
  FormDateField,
  FormInput,
  FormPhoneInput,
  FormTextarea,
} from "@/components/form/controls";
import { FormField } from "@/components/form/FormField";
import { FormSummary } from "@/components/form/FormSummary";
import { PageHeaderNavigation } from "@/components/PageHeaderNavigation";
import { PageTitleOverride } from "@/components/PageTitleOverride";
import { useZodForm } from "@/lib/form/use-zod-form";
import { webApi } from "@/lib/api";
import { personFormState } from "./PersonDetailPage/helpers";
import type { PersonFormState } from "./PersonDetailPage/types";
import {
  personEditFormSchema,
  personFieldLabelKey,
} from "./person-edit-schema";

interface PersonEditFormProps {
  person: v1.persons.Person;
  personHref: string;
}

export function PersonEditForm({ person, personHref }: PersonEditFormProps) {
  const formAction = useFormAction();

  const t = useTranslations("persons");
  const locale = useLocale();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [picture, setPicture] = useState<ProfilePictureChange>(undefined);
  const busy = saving;
  const tAvatar = useTranslations("auth.avatar");
  const [requestError, setRequestError] = useState<string | null>(null);
  const today = v1.common.dateOnlyToday();

  const form = useZodForm<PersonFormState, v1.persons.UpdatePersonInput>(
    personEditFormSchema,
    {
      defaultValues: personFormState(person),
      labelFor: (path) => t(`fields.${personFieldLabelKey(path)}`),
    },
  );

  const dirty = form.formState.isDirty || picture !== undefined;

  async function submit(input: v1.persons.UpdatePersonInput) {
    if (busy || !dirty) return;
    setRequestError(null);
    setSaving(true);
    const values = form.getValues();
    let savingPicture = false;

    try {
      if (form.formState.isDirty) {
        await webApi.fetch(
          v1.persons.ROUTES.update(person.id),
          v1.persons.personSchema,
          { method: "PATCH", json: input },
        );
        // If the picture fails, retry only that unsaved change.
        form.reset(values);
      }
      if (picture !== undefined) {
        savingPicture = true;
        const body = new FormData();
        if (picture) body.append("file", picture);
        await webApi.fetch(
          v1.persons.ROUTES.avatar(person.id),
          v1.persons.personSchema,
          picture ? { method: "POST", body } : { method: "DELETE" },
        );
        setPicture(undefined);
        window.dispatchEvent(new Event("access-changed"));
      }
      router.push(personHref);
      router.refresh();
    } catch (caught) {
      setRequestError(
        caught instanceof ApiError
          ? caught.message
          : savingPicture
            ? tAvatar("failed")
            : t("feedback.genericError"),
      );
      setSaving(false);
    }
  }

  return (
    <PageLayout className="pb-16 sm:pb-24">
      <PageTitleOverride title={t("editPage.title")} />
      <PageHeaderNavigation
        backDisabled={busy}
        onBack={() => {
          if (busy) return;
          if (dirty) setLeaveOpen(true);
          else router.back();
        }}
      />
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("leaveForm.title")}</DialogTitle>
            <DialogDescription>
              {t("leaveForm.editDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {t("leaveForm.keepEditing")}
            </DialogClose>
            <SaveButton
              type="button"
              variant="destructive"
              idleLabel={t("leaveForm.discard")}
              pendingLabel={t("leaveForm.discard")}
              successLabel={t("leaveForm.discard")}
              onClick={() => {
                setLeaveOpen(false);
                router.back();
              }}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FormProvider {...form}>
        <form
          className="flex flex-1 flex-col gap-8"
          aria-busy={busy}
          noValidate
          onSubmit={form.handleSubmit(submit)}
        >
          <ProfilePictureEditor
            name={`${person.firstName} ${person.lastName}`}
            assetId={person.avatarAssetId}
            value={picture}
            onChange={setPicture}
            disabled={busy}
          />
          <FormSummary
            title={t("feedback.updateErrorTitle")}
            message={requestError}
          />

          <fieldset disabled={busy} className="grid min-w-0 gap-8">
            <FormSection title={t("sections.contact")}>
              <FormField
                name="firstName"
                label={t("fields.firstName")}
                required
              >
                <FormInput />
              </FormField>
              <FormField name="lastName" label={t("fields.lastName")} required>
                <FormInput />
              </FormField>
              <FormField name="citizenship" label={t("fields.citizenship")}>
                <FormInput maxLength={200} />
              </FormField>
              <FormField name="cnp" label={t("fields.documentCnp")}>
                <FormInput inputMode="numeric" maxLength={13} />
              </FormField>
              <FormField name="email" label={t("fields.email")} required>
                <FormInput type="email" />
              </FormField>
              <FormField name="phone" label={t("fields.phone")} required>
                <FormPhoneInput
                  locale={locale}
                  placeholder={t("placeholders.phone")}
                  countrySelectLabel={t("fields.phoneCountry")}
                  numberInputLabel={t("fields.phone")}
                />
              </FormField>
              <FormField
                name="dateOfBirth"
                label={t("fields.dateOfBirth")}
                labelSuffix="day"
              >
                <FormDateField maxDate={today} />
              </FormField>
            </FormSection>

            <FormSection title={t("sections.address")}>
              <FormField name="countryCode" label={t("fields.country")}>
                <FormCountrySelect
                  label={t("fields.country")}
                  locale={locale}
                  placeholder={t("placeholders.country")}
                  disabled={busy}
                  searchPlaceholder={t("countryPicker.search")}
                  clearSearchLabel={t("countryPicker.clearSearch")}
                  emptyMessage={t("countryPicker.empty")}
                  closeLabel={t("actions.close")}
                />
              </FormField>
              <FormField name="region" required label={t("fields.region")}>
                <FormInput />
              </FormField>
              <FormField name="city" required label={t("fields.city")}>
                <FormInput />
              </FormField>
              <FormField
                name="addressLine1"
                required
                label={t("fields.addressLine1")}
                className="sm:col-span-2"
              >
                <FormInput />
              </FormField>
              <FormField
                name="addressLine2"
                label={t("fields.addressLine2")}
                className="sm:col-span-2"
              >
                <FormInput />
              </FormField>
            </FormSection>

            <FormSection>
              <FormField
                name="notes"
                label={t("fields.notes")}
                className="sm:col-span-2"
              >
                <FormTextarea rows={4} />
              </FormField>
            </FormSection>
          </fieldset>

          {dirty || busy ? (
            <FormActions
              arrangement="split"
              density="compact"
              ready
              pending={busy}
            >
              <SaveButton
                type="submit"
                disabled={busy}
                {...formAction("save", {
                  pending: saving,
                  error: requestError,
                })}
              />
            </FormActions>
          ) : null}
        </form>
      </FormProvider>
    </PageLayout>
  );
}

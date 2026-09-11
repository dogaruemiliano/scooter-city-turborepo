import { v1 } from "@repo/api-shared";
import {
  buildDateOnly,
  emptyDateParts,
  hasDateParts,
} from "@repo/ui/lib/date-parts";
import type {
  CreatePersonDocumentFormState,
  CreatePersonFormState,
  PersonCitizenship,
  NationalIdFormat,
  DocumentWorkflow,
} from "./types";

export function createEmptyCreateForm(
  citizenship: PersonCitizenship,
): CreatePersonFormState {
  return {
    citizenship,
    nationalIdFormat: "classic",
    documentDrafts: {},
    email: "",
    phone: "",
    phoneCountry: "RO",
    phoneCountryCallingCode: "40",
    phoneNationalNumber: "",
    firstName: "",
    lastName: "",
    dateOfBirth: emptyDateParts(),
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
    countryCode: "RO",
    documents: createInitialDocuments(citizenship),
    notes: "",
  };
}

export function documentWorkflow(
  form: Pick<CreatePersonFormState, "citizenship" | "nationalIdFormat">,
): DocumentWorkflow {
  return form.citizenship === "foreign"
    ? "foreign"
    : form.nationalIdFormat === "electronic"
      ? "romanianElectronic"
      : "romanianClassic";
}

export function createInitialDocuments(
  citizenship: PersonCitizenship,
  nationalIdFormat: NationalIdFormat = "classic",
): CreatePersonDocumentFormState[] {
  const identityDocuments =
    citizenship === "romanian"
      ? [
          {
            ...createDocumentDraft("nationalId", {
              key: `romanian-${nationalIdFormat}-national-id`,
              required: true,
              slot: "identity",
            }),
            nationalIdFormat,
          },
          ...(nationalIdFormat === "electronic"
            ? [
                createDocumentDraft("proofOfAddress", {
                  key: "romanian-proof-of-address",
                  required: true,
                  slot: "supporting",
                }),
              ]
            : []),
        ]
      : [
          createDocumentDraft("passport", {
            key: "foreign-passport",
            required: true,
            slot: "identity",
          }),
          createDocumentDraft("visa", {
            key: "foreign-visa",
            required: false,
            slot: "supporting",
          }),
          createDocumentDraft("residencePermit", {
            key: "foreign-residence-permit",
            required: false,
            slot: "supporting",
          }),
        ];
  return [
    ...identityDocuments,
    createDocumentDraft("driverLicense", {
      key: "driver-license",
      required: false,
      slot: "driverLicense",
    }),
  ];
}

export function switchDocumentWorkflow(
  current: CreatePersonFormState,
  citizenship: PersonCitizenship,
  nationalIdFormat = current.nationalIdFormat,
): CreatePersonFormState {
  const next = { ...current, citizenship, nationalIdFormat };
  if (documentWorkflow(current) === documentWorkflow(next)) return current;
  const drafts = {
    ...current.documentDrafts,
    [documentWorkflow(current)]: current.documents,
  };
  const licence = current.documents.find(
    (document) => document.type === "driverLicense",
  );
  return {
    ...next,
    documentDrafts: drafts,
    documents: (
      drafts[documentWorkflow(next)] ??
      createInitialDocuments(citizenship, nationalIdFormat)
    ).map((document) =>
      document.type === "driverLicense" && licence ? licence : document,
    ),
  };
}

/** Apply asynchronous upload changes to both active and temporarily hidden workflows. */
export function updateDocumentDrafts(
  current: CreatePersonFormState,
  update: (
    document: CreatePersonDocumentFormState,
  ) => CreatePersonDocumentFormState,
): CreatePersonFormState {
  return {
    ...current,
    documents: current.documents.map(update),
    documentDrafts: Object.fromEntries(
      Object.entries(current.documentDrafts).map(([workflow, documents]) => [
        workflow,
        documents.map(update),
      ]),
    ),
  };
}

export function documentPhotoSlots(
  document: CreatePersonDocumentFormState,
): readonly v1.persons.PersonDocumentPhotoSlot[] {
  return document.type === "driverLicense" ||
    document.type === "residencePermit" ||
    (document.type === "nationalId" &&
      document.nationalIdFormat === "electronic")
    ? ["front", "back"]
    : ["front"];
}

export function createDocumentDraft(
  type: v1.persons.PersonDocumentType,
  options: {
    key: string;
    required: boolean;
    slot: CreatePersonDocumentFormState["slot"];
  },
): CreatePersonDocumentFormState {
  return {
    key: options.key,
    required: options.required,
    slot: options.slot,
    type,
    nationalIdFormat: null,
    licenseCategories: [],
    series: "",
    number: "",
    cnp: "",
    issuingCountryCode: "RO",
    issuedBy: "",
    issuedOn: emptyDateParts(),
    hasExpiryDate: type !== "proofOfAddress",
    expiresOn: emptyDateParts(),
    status: type === "driverLicense" ? "unverified" : "verified",
    photos: {},
    notes: "",
  };
}

export function isBlankDocumentDraft(document: CreatePersonDocumentFormState) {
  return (
    !hasSelectedDocumentPhoto(document) &&
    document.licenseCategories.length === 0 &&
    document.series.trim().length === 0 &&
    document.number.trim().length === 0 &&
    document.cnp.trim().length === 0 &&
    document.issuedBy.trim().length === 0 &&
    document.notes.trim().length === 0 &&
    !hasDateParts(document.issuedOn) &&
    !hasDateParts(document.expiresOn)
  );
}

export function hasSelectedDocumentPhoto(
  document: CreatePersonDocumentFormState,
): boolean {
  return v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS.some((slot) =>
    Boolean(document.photos[slot]),
  );
}

export function isUnder18Person(form: CreatePersonFormState): boolean {
  const dateOfBirth =
    form.citizenship === "romanian"
      ? v1.persons.getDateOfBirthFromCnp(
          form.documents.find((document) => document.type === "nationalId")
            ?.cnp,
        )
      : buildDateOnly(form.dateOfBirth).value;

  return v1.persons.isUnder18FromDateOfBirth(dateOfBirth);
}

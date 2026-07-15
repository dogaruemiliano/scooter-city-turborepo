import { v1 } from "@repo/api-shared";
import type { CountryCode } from "@repo/ui/components";
import type { DateParts } from "@repo/ui/lib/date-parts";

export interface PersonCreateFormProps {
  personsHref: string;
}

export interface Feedback {
  kind: "error" | "success";
  title: string;
  messages: string[];
}

export type PersonCitizenship = "romanian" | "foreign";

export type PersonFormFieldKey =
  | "email"
  | "phone"
  | "firstName"
  | "lastName"
  | "dateOfBirth"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "region"
  | "postalCode"
  | "countryCode"
  | "documents"
  | "notes";

export type PersonDocumentFormFieldKey =
  | "type"
  | "series"
  | "number"
  | "cnp"
  | "issuingCountryCode"
  | "issuedBy"
  | "issuedOn"
  | "expiresOn"
  | "status"
  | "notes";

export type FormErrorKey =
  | PersonFormFieldKey
  | `document.${string}.${PersonDocumentFormFieldKey}`;

export type FormErrors = Partial<Record<FormErrorKey, string>>;

export type PersonDocumentPhotoDraftUpload =
  | {
      id: string;
      status: "uploading";
      file: File;
    }
  | {
      id: string;
      status: "uploaded";
      file: File;
      uploadToken: string;
    }
  | {
      id: string;
      status: "failed";
      file: File;
      message: string;
    };

export type PersonDocumentPhotoDraftUploads = Partial<
  Record<v1.persons.PersonDocumentPhotoSlot, PersonDocumentPhotoDraftUpload>
>;

export interface CreatePersonFormState {
  citizenship: PersonCitizenship;
  email: string;
  phone: string;
  phoneCountry: CountryCode;
  phoneCountryCallingCode: string;
  phoneNationalNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: DateParts;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: CountryCode;
  documents: CreatePersonDocumentFormState[];
  notes: string;
}

export interface CreatePersonDocumentFormState {
  key: string;
  required: boolean;
  slot: "identity" | "driverLicense";
  type: v1.persons.PersonDocumentType;
  series: string;
  number: string;
  cnp: string;
  issuingCountryCode: CountryCode;
  issuedBy: string;
  issuedOn: DateParts;
  expiresOn: DateParts;
  status: v1.persons.PersonDocumentStatus;
  photos: PersonDocumentPhotoDraftUploads;
  notes: string;
}

export interface FieldValidationError {
  field: FormErrorKey;
  message: string;
}

export interface FormValidationIssue {
  code: string;
  path: readonly PropertyKey[];
  message: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  format?: string;
}

export type DateField =
  | "dateOfBirth"
  | "documentIssuedOn"
  | "documentExpiresOn";

export type SetPersonFormValue = <Key extends keyof CreatePersonFormState>(
  key: Key,
  value: CreatePersonFormState[Key],
) => void;

export type SetPersonDocumentValue = <Key extends PersonDocumentFormFieldKey>(
  documentKey: string,
  key: Key,
  value: CreatePersonDocumentFormState[Key],
) => void;

export type SetPersonDocumentPhoto = (
  documentKey: string,
  slot: v1.persons.PersonDocumentPhotoSlot,
  file: File | null,
) => void;

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
export type NationalIdFormat = "classic" | "electronic";
export type DocumentWorkflow =
  | "romanianClassic"
  | "romanianElectronic"
  | "foreign";

export type PersonFormFieldKey =
  | "email"
  | "phone"
  | "firstName"
  | "lastName"
  | "cnp"
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
  | "hasExpiryDate"
  | "expiresOn"
  | "status"
  | "licenseCategories"
  | "photos"
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
      originalFile?: File;
    }
  | {
      id: string;
      status: "uploaded";
      file: File;
      originalFile?: File;
      uploadToken: string;
    }
  | {
      id: string;
      status: "failed";
      file: File;
      originalFile?: File;
      message: string;
    };

export type PersonDocumentPhotoDraftUploads = Partial<
  Record<v1.persons.PersonDocumentPhotoSlot, PersonDocumentPhotoDraftUpload>
>;

export interface CreatePersonFormState {
  citizenship: PersonCitizenship;
  nationalIdFormat: NationalIdFormat;
  documentDrafts: Partial<
    Record<DocumentWorkflow, CreatePersonDocumentFormState[]>
  >;
  email: string;
  phone: string;
  phoneCountry: CountryCode;
  phoneCountryCallingCode: string;
  phoneNationalNumber: string;
  firstName: string;
  lastName: string;
  cnp: string;
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
  slot: "identity" | "driverLicense" | "supporting";
  type: v1.persons.PersonDocumentType;
  nationalIdFormat: NationalIdFormat | null;
  licenseCategories: v1.persons.PersonDriverLicenseCategoryEntry[];
  series: string;
  number: string;
  cnp: string;
  issuingCountryCode: CountryCode | "";
  issuedBy: string;
  issuedOn: DateParts;
  hasExpiryDate: boolean;
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

export type SetPersonDocument = (
  document: CreatePersonDocumentFormState,
  editedFields?: readonly PersonDocumentFormFieldKey[],
) => void;

export type SetPersonDocumentPhoto = (
  documentKey: string,
  slot: v1.persons.PersonDocumentPhotoSlot,
  file: File | null,
  originalFile?: File,
) => void;

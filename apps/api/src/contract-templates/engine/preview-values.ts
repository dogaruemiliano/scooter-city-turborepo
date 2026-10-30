import { v1 } from "@repo/api-shared";
import {
  FIELD_REGISTRY,
  INITIAL_DOCUMENT_FIELDS,
  type ContractTemplateType,
} from "./registry";
import type {
  ContractFieldKey,
  TemplateValues,
  TemplateValue,
} from "./docx-engine";
const base = {
  aestheticCondition:
    "Stare estetică demonstrativă; conform materialului de test",
  antitheftHandover: "Nu se predă",
  authorizedUsers: "Nu sunt desemnați utilizatori autorizați suplimentari",
  batteryChargeCondition: "OK",
  batteryChargeNotes: "Fără observații",
  billingAnchorAt: "30.10.2026, ora 15:30",
  billingCycleDays: "7",
  billingStartsAt: "30.10.2026, ora 15:30",
  brakeLightCondition: "OK",
  brakeLightNotes: "Fără observații",
  brandName: "ScooterCity",
  civDocDelivery: "Da, prin WhatsApp",
  civDocNotes: "Document demonstrativ, transmitere de test",
  companyAddress:
    "sat Olteni, comuna Bujoreni, str. Monumentului nr. 16, jud. Vâlcea",
  companyLogo: "ScooterCity – logo de test",
  companyName: "JUSEM HUB S.R.L.",
  companyPrivacyEmail: "office@scooter-city.ro",
  companyRepresentativeName: "DOGARU EMILIANO-CONSTANTIN",
  companyRepresentativeRole: "administrator",
  companySignContract: "________________________",
  companySignGdpr: "________________________",
  companySignHandover: "________________________",
  companyTaxId: "54842598",
  companyTradeRegisterNumber: "J2026037146005",
  contractDate: "30.10.2026",
  contractNumber: "DEMO-001",
  depositAmount: "300,00",
  depositPaymentMethod: "numerar",
  durationMonths: "24",
  electricStartCondition: "OK",
  electricStartNotes: "Fără observații",
  engineCondition: "OK",
  engineNotes: "Fără observații",
  frontTyreCondition: "OK",
  frontTyreNotes: "Fără observații",
  fuelLevel: "¼ rezervor",
  gdprCommunicatedAt: "30.10.2026, ora 15:00",
  gpsHistoryStatement: "nu păstrează istoricul traseelor în aplicația sa",
  handoverDate: "30.10.2026",
  handoverMedia:
    "1 videoclip demonstrativ; referință de test, nu livrare reală",
  handoverTime: "15:30",
  headlightCondition: "OK",
  headlightNotes: "Fără observații",
  helmetCondition: "Bună",
  helmetHandover: "Predată",
  helmetNotes: "Fără observații suplimentare",
  helmetQuantity: "1",
  hornCondition: "OK",
  hornNotes: "Fără observații",
  indicatorsCondition: "OK",
  indicatorsNotes: "Fără observații",
  insuranceDocDelivery: "Da, prin WhatsApp",
  insuranceDocNotes: "Document demonstrativ, transmitere de test",
  keyCondition: "Bună",
  keysQuantity: "1",
  kickstartCondition: "OK",
  kickstartNotes: "Fără observații",
  latePenaltyPercent: "0,3",
  luggageRackHandover: "Nu se predă",
  maintenanceNoticeHours: "24",
  mileageAtHandover: "25.000 km indicați la bord; odometru funcțional",
  mirrorsCondition: "OK",
  mirrorsNotes: "Fără observații",
  noticeDays: "7",
  odometerCondition: "OK",
  odometerNotes: "Fără observații",
  otherDocsDelivery: "Nu se predau",
  otherDocsNotes: "Nu se aplică",
  otherEquipment: "Nu se predau alte accesorii",
  paymentGraceDays: "3",
  paymentGraceDaysWords: "trei",
  phoneHolderCondition: "Bună",
  phoneHolderNotes: "Fără observații suplimentare",
  phoneHolderPresence: "Prezent",
  rearTyreCondition: "OK",
  rearTyreNotes: "Fără observații",
  registrationDocDelivery: "Da, prin WhatsApp",
  registrationDocNotes: "Document demonstrativ, transmitere de test",
  rentPaymentMethod: "numerar",
  rentalEndsOn: "29.10.2028",
  rentalStartsOn: "30.10.2026",
  renterAddress: "ADRESĂ FICTIVĂ PENTRU TESTAREA ȘABLONULUI",
  renterCitizenship: "română",
  renterEmail: "client@example.test",
  renterFirstName: "CLIENT",
  renterFullName: "EXEMPLU CLIENT",
  renterIdExpiresOn: "30.10.2030",
  renterIdNumber: "DEMO123",
  renterIdSeries: "TEST",
  renterIdType: "carte de identitate",
  renterLastName: "EXEMPLU",
  renterNationalId: "DATE-DE-TEST-NU-CNP",
  renterPhone: "+40 700 000 000",
  renterSignContract: "________________________",
  renterSignGdpr: "________________________",
  renterSignHandover: "________________________",
  renterSignSpeed: "________________________",
  returnAfterNoticeHours: "24",
  scooterBrand: "MARCĂ DEMONSTRATIVĂ",
  scooterColor: "gri",
  scooterInternalCode: "DEMO-001",
  scooterLimiterBasis:
    "Configurație demonstrativă conform documentației de test",
  scooterLimiterStatus: "Limitare prezentă",
  scooterLimiterValue: "25 km/h",
  scooterMaxSpeedKmh: "25",
  scooterMaxSpeedSource: "CIV demonstrativ – valoare de test",
  scooterModel: "MODEL DEMONSTRATIV",
  scooterRegistrationNumber: "NUMĂR DE TEST",
  scooterVin: "VIN-DE-TEST-NEVALID",
  scooterYear: "2022",
  speedCheckMethod: "Verificare tehnică demonstrativă",
  speedCheckResult: "Rezultat demonstrativ corespunzător pragului de 25 km/h",
  speedCheckedAt: "30.10.2026, ora 15:20",
  speedDeclaration:
    "Am verificat efectiv la predare, împreună cu LOCATORUL, prin metoda consemnată în prezenta anexă, limitarea scuterului la 25 km/h și confirm că l-am primit cu limitarea activă. Am fost informat că viteza maximă constructivă înscrisă în documentele vehiculului este de 25 km/h. Nu voi îndepărta, dezactiva, modifica sau permite modificarea neautorizată a limitării ori a configurației tehnice. Răspund, în condițiile legii, pentru intervențiile neautorizate și prejudiciile care îmi sunt imputabile.",
  speedometerCondition: "OK",
  speedometerNotes: "Fără observații",
  technicalNotes: "Fără alte observații tehnice în acest exemplu",
  templateVersion: "scootercity-rental-v2.0.0",
  topCaseHandover: "Nu se predă",
  usbCondition: "Funcțională",
  usbNotes: "Fără observații suplimentare",
  usbPresence: "Prezentă",
  weeklyRent: "300,00",
} as const;
const variations = {
  "45": {
    scooterLimiterValue: "45 km/h",
    scooterMaxSpeedKmh: "45",
    speedCheckResult: "Rezultat demonstrativ corespunzător pragului de 45 km/h",
    speedDeclaration:
      "Am verificat efectiv la predare, împreună cu LOCATORUL, prin metoda consemnată în prezenta anexă, limitarea scuterului la 45 km/h și confirm că l-am primit cu limitarea activă. Am fost informat că viteza maximă constructivă înscrisă în documentele vehiculului este de 45 km/h. Nu voi îndepărta, dezactiva, modifica sau permite modificarea neautorizată a limitării ori a configurației tehnice. Răspund, în condițiile legii, pentru intervențiile neautorizate și prejudiciile care îmi sunt imputabile.",
  },
  "fara-limitator": {
    renterSignSpeed:
      "Nu se aplică – confirmarea configurației este inclusă în semnarea anexei",
    scooterLimiterStatus: "Fără sistem de limitare distinct",
    scooterLimiterValue: "Nu se aplică",
    scooterMaxSpeedKmh: "90",
    speedCheckMethod: "Nu se aplică – nu există sistem de limitare distinct",
    speedCheckResult: "Nu se aplică",
    speedCheckedAt: "Nu se aplică",
    speedDeclaration:
      "Am fost informat că viteza maximă constructivă a scuterului este de 90 km/h, conform documentului menționat în anexă, și că scuterul este predat fără sistem de limitare distinct, în configurația documentată. Nu declar verificarea unui limitator inexistent. Lipsa acestui sistem nu înseamnă viteză nelimitată și nu autorizează modificări tehnice nepermise sau depășirea limitelor legale. Răspund, în condițiile legii, pentru intervențiile neautorizate și prejudiciile care îmi sunt imputabile.",
  },
} as const;
export const PREVIEW_SCENARIOS = [
  "25",
  "45",
  "NO_LIMITER",
  "LONG_NAMES",
  "ABSENT_EQUIPMENT",
  "DEFECTS",
] as const;
export type PreviewScenario = (typeof PREVIEW_SCENARIOS)[number];
/** Synthetic, visibly labelled fixtures. Never import these values into rental/person tables. */
export function previewValues(
  type: ContractTemplateType,
  scenario: PreviewScenario,
): TemplateValues {
  const data: Record<string, TemplateValue> = {
    ...base,
    ...(scenario === "45"
      ? variations["45"]
      : scenario === "NO_LIMITER"
        ? variations["fara-limitator"]
        : {}),
    brandName: "DEMONSTRAȚIE — DATE SINTETICE",
    companyName: "SOCIETATE DEMONSTRATIVĂ — EXEMPLU FĂRĂ VALOARE CONTRACTUALĂ",
    scooterInternalCode: v1.scooters.scooterDisplayCode({
      fleetNumber: 1,
      brandCode: "HON",
    }),
    companyLogo: {
      kind: "image",
      bytes: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
      mimeType: "image/png",
      alt: "Logo demonstrativ",
    },
  };
  for (const field of FIELD_REGISTRY)
    if (field.type === "signature") data[field.key] = { kind: "unsigned" };
  if (scenario === "NO_LIMITER")
    data.renterSignSpeed = { kind: "not-applicable" };
  if (scenario === "LONG_NAMES") {
    data.renterFullName =
      "Ștefănescu-Popescu Alexandru Constantin Ioan — NUME DEMONSTRATIV CU DIACRITICE";
    data.renterLastName = "Ștefănescu-Popescu";
    data.renterFirstName = "Alexandru Constantin Ioan";
    data.renterAddress =
      "Adresă demonstrativă: Șoseaua Independenței, numărul 123, bloc Demonstrativ, scara Ș, apartamentul 456, București";
  }
  if (scenario === "ABSENT_EQUIPMENT") {
    data.usbPresence = "Absentă";
    data.usbCondition = "Nu se aplică";
    data.phoneHolderPresence = "Absent";
    data.phoneHolderCondition = "Nu se aplică";
    data.helmetQuantity = "0";
    data.helmetHandover = "Nu se predă";
    data.helmetCondition = "Nu se aplică";
    data.helmetNotes = "Nu se aplică — nu se predă cască în acest exemplu";
    data.usbNotes = "Nu se aplică";
    data.phoneHolderNotes = "Nu se aplică";
  }
  if (scenario === "DEFECTS") {
    data.odometerCondition = "Defect";
    data.odometerNotes = "Valoare afișată fără confirmarea kilometrajului real";
    data.mileageAtHandover =
      "12.345 afișat; kilometrajul real actual nu este confirmat";
    data.technicalNotes =
      "EXEMPLU DE DEFECT — PREDAREA ESTE BLOCATĂ ÎN FLUXUL REAL";
  }
  const keys: readonly ContractFieldKey[] =
    type === "PROMOTION_ADDENDUM" ? [] : INITIAL_DOCUMENT_FIELDS[type];
  return Object.fromEntries(keys.map((key) => [key, data[key]]));
}

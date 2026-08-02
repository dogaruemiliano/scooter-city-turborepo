import {
  BillingStatus,
  FinancialCategoryKind,
  MoneyTransactionScope,
  MoneyTransactionStatus,
  MoneyTransactionType,
  PaymentMethod,
  Prisma,
  type PrismaClient,
  type WalletBalanceBucket,
  WalletBalanceBucket as BalanceBucket,
  type WalletType,
  WalletType as FinanceWalletType,
} from "../../src/generated/prisma/client";
import { categoryCodeFromPath } from "../../src/finance/category-code";

const CURRENCY = "RON";
const USER_WALLET_SUFFIX = "personal wallet";
const FINANCE_SEED_VERSION = "v2";
const FINANCE_SEED_PREFIX = `seed:finance:${FINANCE_SEED_VERSION}`;
const ANCHOR_TRANSACTION_ID = "seed-finance-tx-v2-operating-income-34";
const TRANSACTION_TIMEOUT_MS = 60_000;

export const FINANCE_SEED_IDS = {
  secondAdmin: "seed-user-finance-admin",
  secondAdminWallet: "seed-wallet-finance-admin",
  operatingCompany: "seed-company-jusem-hub",
  operatingCompanyCounterparty: "seed-counterparty-jusem-hub",
  operatingLegalEntity: "seed-business-legal-entity-jusem-hub",
  operatingCompanyOwner: "seed-business-owner-jusem-hub-primary-admin",
  operatingCompanyVatPeriod: "seed-vat-period-jusem-hub-ro",
  cashWallet: "seed-wallet-company-cash-main",
  bankWallet: "seed-wallet-company-bank-main",
  processorWallet: "seed-wallet-payment-processor-main",
} as const;

type SeedBalanceChange = {
  id: string;
  walletId: string;
  bucket: WalletBalanceBucket;
  amountDelta: string;
};

type SeedReference = {
  id: string;
  referenceType: string;
  referenceId: string;
  isPrimary: boolean;
};

type SeedTransaction = {
  id: string;
  type: MoneyTransactionType;
  status: MoneyTransactionStatus;
  amount: string;
  currency: string;
  financialScope: MoneyTransactionScope;
  paymentMethod: PaymentMethod | null;
  billingStatus: BillingStatus;
  categoryId: string | null;
  counterpartyUserId: string | null;
  counterpartyId: string | null;
  recipientUserId: string | null;
  recipientCounterpartyId: string | null;
  debtorUserId: string | null;
  debtorCounterpartyId: string | null;
  creditorUserId: string | null;
  creditorCounterpartyId: string | null;
  recordedByUserId: string;
  occurredAt: Date;
  description: string;
  idempotencyKey: string;
  originTransactionId: string | null;
  reversalOfTransactionId: string | null;
  balanceChanges: SeedBalanceChange[];
  references: SeedReference[];
};

type TransactionInput = Omit<
  SeedTransaction,
  | "id"
  | "currency"
  | "idempotencyKey"
  | "balanceChanges"
  | "references"
  | "counterpartyId"
  | "recipientCounterpartyId"
  | "debtorCounterpartyId"
  | "creditorCounterpartyId"
> & {
  idempotencyKey?: string;
  balanceChanges?: Array<Omit<SeedBalanceChange, "id">>;
  references?: Array<Omit<SeedReference, "id">>;
  counterpartyId?: string | null;
  recipientCounterpartyId?: string | null;
  debtorCounterpartyId?: string | null;
  creditorCounterpartyId?: string | null;
};

type CompanySeed = {
  id: string;
  counterpartyId: string;
  legalName: string;
  tradingName: string;
  taxIdentifier: string;
  registrationNumber: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  region: string;
  postalCode: string;
  notes: string;
};

type FinanceCategorySeed = {
  id: string;
  key: string;
  name: string;
  kind: FinancialCategoryKind;
  parentKey?: string;
};

type FinanceCategorySeedGroup = {
  kind: FinancialCategoryKind;
  parent: { key: string; name: string };
  children: ReadonlyArray<{ key: string; name: string }>;
};

type FinanceSeedContext = {
  adminA: { id: string; walletId: string };
  adminB: { id: string; walletId: string };
  ana: { id: string; walletId: string };
  mihai: { id: string; walletId: string };
  elena: { id: string; walletId: string };
  categories: Record<string, string>;
  companyCounterparties: Record<string, string>;
  people: PersonFinanceSeed[];
  anchor: Date;
};

type PersonFinanceSeed = {
  personId: string;
  userId: string;
  walletId: string;
  counterpartyId: string;
  deletedAt: Date | null;
};

const OPERATING_COMPANY_SEED: CompanySeed = {
  id: FINANCE_SEED_IDS.operatingCompany,
  counterpartyId: FINANCE_SEED_IDS.operatingCompanyCounterparty,
  legalName: "JUSEM HUB SRL",
  tradingName: "JUSEM HUB",
  taxIdentifier: "RO00000000",
  registrationNumber: "J40/0000/2024",
  email: "financiar@jusem-hub.example",
  phone: "+40700000000",
  addressLine1: "Strada Exemplului 1",
  city: "Bucuresti",
  region: "B",
  postalCode: "010001",
  notes:
    "Companie operationala fictiva folosita exclusiv pentru datele locale de dezvoltare si testare.",
};

const OPERATING_COMPANY_EFFECTIVE_FROM = new Date("2024-01-01T00:00:00.000Z");

const COMPANY_SEEDS: Readonly<Record<string, CompanySeed>> = {
  partsMoto: {
    id: "seed-company-piese-moto-bucuresti",
    counterpartyId: "seed-counterparty-piese-moto-bucuresti",
    legalName: "Piese Moto Bucuresti SRL",
    tradingName: "Piese Moto Bucuresti",
    taxIdentifier: "RO42817365",
    registrationNumber: "J40/8421/2020",
    email: "comenzi@piesemotobucuresti.example",
    phone: "+40722110101",
    addressLine1: "Soseaua Colentina 214",
    city: "Bucuresti",
    region: "B",
    postalCode: "021194",
    notes: "Furnizor de piese, consumabile si accesorii pentru scutere.",
  },
  motoDepozit: {
    id: "seed-company-moto-depozit",
    counterpartyId: "seed-counterparty-moto-depozit",
    legalName: "Moto Depozit Distribution SRL",
    tradingName: "Moto Depozit",
    taxIdentifier: "RO36591274",
    registrationNumber: "J23/4190/2016",
    email: "vanzari@motodepozit.example",
    phone: "+40733110202",
    addressLine1: "Strada Industriilor 18",
    city: "Chiajna",
    region: "IF",
    postalCode: "077040",
    notes: "Depozit de anvelope, baterii si piese de schimb.",
  },
  service: {
    id: "seed-company-service-scutere-rapid",
    counterpartyId: "seed-counterparty-service-scutere-rapid",
    legalName: "Service Scutere Rapid SRL",
    tradingName: "Scutere Rapid",
    taxIdentifier: "RO45120837",
    registrationNumber: "J40/16802/2021",
    email: "programari@scutererapid.example",
    phone: "+40744110303",
    addressLine1: "Calea Mosilor 286",
    city: "Bucuresti",
    region: "B",
    postalCode: "020892",
    notes: "Atelier partener; contact principal mecanic: Mihai Ionescu.",
  },
  insuranceA: {
    id: "seed-company-sigur-mobility",
    counterpartyId: "seed-counterparty-sigur-mobility",
    legalName: "Sigur Mobility Asigurari SA",
    tradingName: "Sigur Mobility",
    taxIdentifier: "RO15890412",
    registrationNumber: "J40/11220/2003",
    email: "flote@sigur-mobility.example",
    phone: "+40213110404",
    addressLine1: "Bulevardul Dacia 52",
    city: "Bucuresti",
    region: "B",
    postalCode: "010414",
    notes: "Furnizor polite RCA si CASCO pentru flota.",
  },
  insuranceB: {
    id: "seed-company-protect-asig",
    counterpartyId: "seed-counterparty-protect-asig",
    legalName: "Protect Asig Broker SRL",
    tradingName: "Protect Asig",
    taxIdentifier: "RO27460193",
    registrationNumber: "J40/9365/2010",
    email: "office@protectasig.example",
    phone: "+40213110505",
    addressLine1: "Strada Polona 68",
    city: "Bucuresti",
    region: "B",
    postalCode: "010505",
    notes: "Broker de asigurare pentru reinnoiri si dosare de dauna.",
  },
  internet: {
    id: "seed-company-netlink-business",
    counterpartyId: "seed-counterparty-netlink-business",
    legalName: "Netlink Business Communications SA",
    tradingName: "Netlink Business",
    taxIdentifier: "RO14399840",
    registrationNumber: "J40/12278/2001",
    email: "business@netlink.example",
    phone: "+40213110606",
    addressLine1: "Splaiul Independentei 319",
    city: "Bucuresti",
    region: "B",
    postalCode: "060044",
    notes: "Abonament de internet pentru magazin si atelier.",
  },
  landlord: {
    id: "seed-company-proprietati-urbane",
    counterpartyId: "seed-counterparty-proprietati-urbane",
    legalName: "Proprietati Urbane Dima SRL",
    tradingName: "Proprietati Urbane Dima",
    taxIdentifier: "RO39281746",
    registrationNumber: "J40/5240/2018",
    email: "contracte@proprietati-dima.example",
    phone: "+40755110707",
    addressLine1: "Strada Traian 144",
    city: "Bucuresti",
    region: "B",
    postalCode: "030576",
    notes: "Proprietarul spatiului inchiriat pentru magazin si service.",
  },
};

const COMPANY_WALLETS: ReadonlyArray<{
  id: string;
  type: WalletType;
  name: string;
}> = [
  {
    id: FINANCE_SEED_IDS.cashWallet,
    type: FinanceWalletType.COMPANY_CASH,
    name: "Caserie",
  },
  {
    id: FINANCE_SEED_IDS.bankWallet,
    type: FinanceWalletType.COMPANY_BANK,
    name: "BCR",
  },
  {
    id: FINANCE_SEED_IDS.processorWallet,
    type: FinanceWalletType.PAYMENT_PROCESSOR,
    name: "Online payments",
  },
];

const LEGACY_CATEGORY_IDS: Readonly<Record<string, string>> = {
  RENTAL_REVENUE: "seed-finance-category-rental-revenue",
  RENTAL_INCOME: "seed-finance-category-personal-rental-income",
  SCOOTERS: "seed-finance-category-scooters",
  FUEL: "seed-finance-category-fuel",
  MAINTENANCE: "seed-finance-category-maintenance",
  SCOOTER_INSURANCE: "seed-finance-category-scooter-insurance",
  SCOOTER_ITP: "seed-finance-category-scooter-itp",
  SCOOTER_RAR: "seed-finance-category-scooter-rar",
  SCOOTER_PAINTING: "seed-finance-category-scooter-painting",
  LUBRICANTS: "seed-finance-category-scooter-oil-change",
  SCOOTER_GPS: "seed-finance-category-scooter-gps-internet",
  SCOOTER_PARTS: "seed-finance-category-scooter-parts-consumables",
  SCOOTER_TIRES: "seed-finance-category-scooter-tires",
  SCOOTER_REGISTRATION: "seed-finance-category-scooter-registration",
  CLEANING: "seed-finance-category-cleaning",
  SCOOTER_TRANSPORT: "seed-finance-category-scooter-transport",
  COMPANY_EXPENSES: "seed-finance-category-company-expenses",
  RENT_AND_UTILITIES: "seed-finance-category-rent-utilities",
  COMPANY_ACCOUNTING: "seed-finance-category-company-accounting",
  COMPANY_INTERNET: "seed-finance-category-company-internet",
  COMPANY_PHONE: "seed-finance-category-company-security",
  COMPANY_UTILITIES: "seed-finance-category-company-utilities",
  PAYMENT_PROCESSING: "seed-finance-category-payment-processing",
  COMPANY_OFFICE_SUPPLIES: "seed-finance-category-company-office-supplies",
  TAXES_AUTHORITIES: "seed-finance-category-company-taxes-permits",
  MARKETING_EXPENSES: "seed-finance-category-company-marketing",
  COMPANY_LAWYER: "seed-finance-category-company-insurance",
  OTHER_EXPENSES: "seed-finance-category-company-other-expenses",
  ADMINISTRATOR_EXPENSE: "seed-finance-category-admin-expense",
};

const CATEGORY_GROUPS: readonly FinanceCategorySeedGroup[] = [
  {
    kind: FinancialCategoryKind.EXPENSE,
    parent: { key: "SCOOTERS", name: "Scutere" },
    children: [
      { key: "SCOOTER_ACCESSORIES", name: "Accesorii" },
      { key: "SCOOTER_PURCHASE", name: "Achiziție scuter" },
      { key: "SCOOTER_TIRES", name: "Anvelope" },
      { key: "SCOOTER_INSURANCE", name: "Asigurare RCA" },
      { key: "SCOOTER_BATTERY", name: "Baterie" },
      { key: "FUEL", name: "Carburant" },
      { key: "SCOOTER_CASCO", name: "CASCO" },
      { key: "SCOOTER_WRAP", name: "Colantare" },
      { key: "SCOOTER_GPS", name: "GPS" },
      { key: "SCOOTER_TAX", name: "Impozit" },
      { key: "SCOOTER_REGISTRATION", name: "Înmatriculare" },
      { key: "SCOOTER_ITP", name: "ITP" },
      { key: "LUBRICANTS", name: "Lubrifianți" },
      { key: "SCOOTER_PARTS", name: "Piese de schimb" },
      { key: "SCOOTER_RAR", name: "RAR" },
      { key: "SCOOTER_REPAIRS", name: "Reparații" },
      { key: "MAINTENANCE", name: "Revizie" },
      { key: "CLEANING", name: "Spălătorie" },
      { key: "SCOOTER_PARKING_FEES", name: "Taxe de parcare" },
      { key: "SCOOTER_TRANSPORT", name: "Transport scuter" },
      { key: "SCOOTER_PAINTING", name: "Vopsire" },
    ],
  },
  {
    kind: FinancialCategoryKind.EXPENSE,
    parent: { key: "COMPANY_EXPENSES", name: "Companie" },
    children: [
      { key: "COMPANY_AWS", name: "AWS" },
      { key: "COMPANY_LAWYER", name: "Avocat" },
      { key: "RENT_AND_UTILITIES", name: "Chirie" },
      { key: "COMPANY_CONSULTING", name: "Consultanță" },
      { key: "COMPANY_ACCOUNTING", name: "Contabilitate" },
      { key: "COMPANY_OFFICE_SUPPLIES", name: "Consumabile birou" },
      { key: "COMPANY_DOMAINS", name: "Domenii" },
      { key: "COMPANY_IT_EQUIPMENT", name: "Echipamente IT" },
      { key: "COMPANY_GOOGLE_CLOUD", name: "Google Cloud" },
      { key: "COMPANY_HOSTING", name: "Hosting" },
      { key: "COMPANY_INTERNET", name: "Internet" },
      { key: "COMPANY_SOFTWARE_LICENSES", name: "Licențe software" },
      { key: "COMPANY_MICROSOFT_365", name: "Microsoft 365" },
      { key: "COMPANY_FURNITURE", name: "Mobilier" },
      { key: "COMPANY_OPENAI", name: "OpenAI" },
      { key: "COMPANY_PHONE", name: "Telefonie" },
      { key: "COMPANY_UTILITIES", name: "Utilități" },
    ],
  },
  {
    kind: FinancialCategoryKind.EXPENSE,
    parent: { key: "PERSONNEL_EXPENSES", name: "Personal" },
    children: [
      { key: "PERSONNEL_BONUSES", name: "Bonusuri" },
      { key: "PERSONNEL_CONTRACTORS", name: "Colaboratori" },
      { key: "ADMINISTRATOR_EXPENSE", name: "Diurne" },
      { key: "PERSONNEL_PPE", name: "Echipament protecție" },
      { key: "PERSONNEL_SALARIES", name: "Salarii" },
      { key: "PERSONNEL_TRAINING", name: "Training" },
      { key: "PERSONNEL_UNIFORMS", name: "Uniforme" },
    ],
  },
  {
    kind: FinancialCategoryKind.EXPENSE,
    parent: { key: "MARKETING_EXPENSES", name: "Marketing" },
    children: [
      { key: "MARKETING_BANNERS", name: "Bannere" },
      { key: "MARKETING_BRANDING", name: "Branding" },
      { key: "MARKETING_FACEBOOK_ADS", name: "Facebook Ads" },
      { key: "MARKETING_GOOGLE_ADS", name: "Google Ads" },
      { key: "MARKETING_INFLUENCERS", name: "Influenceri" },
      {
        key: "MARKETING_PROMOTIONAL_MATERIALS",
        name: "Materiale promoționale",
      },
      { key: "MARKETING_STICKERS", name: "Stickere" },
      { key: "MARKETING_TIKTOK_ADS", name: "TikTok Ads" },
      { key: "MARKETING_WEBSITE", name: "Website" },
    ],
  },
  {
    kind: FinancialCategoryKind.EXPENSE,
    parent: { key: "LOGISTICS_EXPENSES", name: "Logistică" },
    children: [
      { key: "LOGISTICS_ACCOMMODATION", name: "Cazare" },
      { key: "LOGISTICS_VAN_FUEL", name: "Combustibil autoutilitară" },
      { key: "LOGISTICS_COURIER", name: "Curier" },
      { key: "LOGISTICS_TRAVEL_ALLOWANCE", name: "Diurnă deplasări" },
      { key: "LOGISTICS_ROAD_TAXES", name: "Taxe drum" },
      {
        key: "LOGISTICS_INTERNATIONAL_TRANSPORT",
        name: "Transport internațional",
      },
      { key: "LOGISTICS_INTERNAL_TRANSPORT", name: "Transport intern" },
    ],
  },
  {
    kind: FinancialCategoryKind.EXPENSE,
    parent: { key: "FINANCIAL_EXPENSES", name: "Financiar" },
    children: [
      { key: "FINANCIAL_BANK_FEES", name: "Comisioane bancare" },
      { key: "PAYMENT_PROCESSING", name: "Comisioane POS" },
      { key: "FINANCIAL_INTEREST", name: "Dobânzi" },
      { key: "FINANCIAL_EXCHANGE_DIFFERENCES", name: "Diferențe curs valutar" },
      { key: "FINANCIAL_LEASING", name: "Leasing" },
      { key: "FINANCIAL_PENALTIES", name: "Penalități" },
      { key: "FINANCIAL_LOAN_PAYMENTS", name: "Rate credite" },
    ],
  },
  {
    kind: FinancialCategoryKind.EXPENSE,
    parent: { key: "TAXES_AUTHORITIES", name: "Taxe și autorități" },
    children: [
      { key: "TAXES_FINES", name: "Amenzi" },
      { key: "TAXES_MICRO", name: "Impozit micro" },
      { key: "TAXES_PROFIT", name: "Impozit profit" },
      { key: "TAXES_ANAF", name: "Taxe ANAF" },
      { key: "TAXES_LOCAL", name: "Taxe locale" },
      { key: "TAXES_VAT", name: "TVA" },
    ],
  },
  {
    kind: FinancialCategoryKind.EXPENSE,
    parent: { key: "INVENTORY_EXPENSES", name: "Inventar" },
    children: [
      { key: "INVENTORY_SERVICE_EQUIPMENT", name: "Echipamente service" },
      { key: "INVENTORY_CONSUMABLE_PARTS", name: "Piese consumabile" },
      { key: "INVENTORY_SHELVING", name: "Rafturi" },
      { key: "INVENTORY_TOOLS", name: "Scule" },
      { key: "INVENTORY_HAND_TOOLS", name: "Unelte" },
    ],
  },
  {
    kind: FinancialCategoryKind.EXPENSE,
    parent: { key: "MISCELLANEOUS_EXPENSES", name: "Diverse" },
    children: [
      { key: "OTHER_EXPENSES", name: "Alte cheltuieli" },
      { key: "MISC_GIFTS", name: "Cadouri" },
      { key: "MISC_DONATIONS", name: "Donații" },
      { key: "MISC_SPONSORSHIPS", name: "Sponsorizări" },
    ],
  },
  {
    kind: FinancialCategoryKind.INCOME,
    parent: { key: "RENTAL_INCOME", name: "Închirieri" },
    children: [
      { key: "RENTAL_REVENUE", name: "Închiriere scuter" },
      { key: "RENTAL_EXTENSION", name: "Prelungire închiriere" },
      { key: "RENTAL_DEPOSIT_RETAINED", name: "Garanție reținută" },
      { key: "RENTAL_LATE_FEE", name: "Taxă întârziere" },
      { key: "RENTAL_EXTRA_KILOMETERS", name: "Taxă kilometri suplimentari" },
    ],
  },
  {
    kind: FinancialCategoryKind.INCOME,
    parent: { key: "SERVICE_INCOME", name: "Service" },
    children: [
      { key: "SERVICE_DIAGNOSTICS", name: "Diagnostic" },
      { key: "SERVICE_LABOR", name: "Manoperă" },
      { key: "SERVICE_REPAIRS", name: "Reparații" },
      { key: "SERVICE_MAINTENANCE", name: "Revizie" },
    ],
  },
  {
    kind: FinancialCategoryKind.INCOME,
    parent: { key: "PARTS_INCOME", name: "Piese" },
    children: [
      { key: "PARTS_ACCESSORY_SALES", name: "Vânzare accesorii" },
      { key: "PARTS_TIRE_SALES", name: "Vânzare anvelope" },
      { key: "PARTS_BATTERY_SALES", name: "Vânzare baterii" },
      { key: "PARTS_SALES", name: "Vânzare piese" },
    ],
  },
  {
    kind: FinancialCategoryKind.INCOME,
    parent: { key: "VEHICLE_SALES_INCOME", name: "Vânzare vehicule" },
    children: [
      { key: "MOTORCYCLE_SALES", name: "Vânzare motocicletă" },
      { key: "SCOOTER_SALES", name: "Vânzare scuter" },
      { key: "ELECTRIC_SCOOTER_SALES", name: "Vânzare scuter electric" },
    ],
  },
  {
    kind: FinancialCategoryKind.INCOME,
    parent: { key: "DELIVERY_INCOME", name: "Livrări" },
    children: [
      { key: "DELIVERY_OTHER_PLATFORMS", name: "Alte platforme" },
      { key: "DELIVERY_BOLT", name: "Comisioane Bolt" },
      { key: "DELIVERY_GLOVO", name: "Comisioane Glovo" },
      { key: "DELIVERY_TAZZ", name: "Comisioane Tazz" },
    ],
  },
  {
    kind: FinancialCategoryKind.INCOME,
    parent: { key: "FINANCIAL_INCOME", name: "Financiar" },
    children: [
      { key: "FINANCIAL_BANK_BONUSES", name: "Bonusuri bancă" },
      { key: "FINANCIAL_CASHBACK", name: "Cashback" },
      { key: "FINANCIAL_INCOME_INTEREST", name: "Dobânzi" },
      {
        key: "FINANCIAL_INCOME_EXCHANGE_DIFFERENCES",
        name: "Diferențe curs valutar",
      },
    ],
  },
  {
    kind: FinancialCategoryKind.INCOME,
    parent: { key: "OTHER_INCOME", name: "Venituri diverse" },
    children: [
      { key: "OTHER_INCOME_MISC", name: "Alte venituri" },
      { key: "OTHER_INCOME_INSURANCE", name: "Despăgubiri asigurare" },
      { key: "OTHER_INCOME_PENALTIES", name: "Penalități încasate" },
      { key: "OTHER_INCOME_GRANTS", name: "Subvenții" },
    ],
  },
];

const categorySeedCollator = new Intl.Collator("ro", {
  numeric: true,
  sensitivity: "base",
});

assertDistinctParentAndChildNames(CATEGORY_GROUPS);

const CATEGORY_SEEDS: readonly FinanceCategorySeed[] = [...CATEGORY_GROUPS]
  .sort(
    (left, right) =>
      categorySeedCollator.compare(left.parent.name, right.parent.name) ||
      left.kind.localeCompare(right.kind) ||
      left.parent.key.localeCompare(right.parent.key),
  )
  .flatMap(({ kind, parent, children }) => [
    {
      id: financeCategorySeedId(parent.key),
      key: parent.key,
      name: parent.name,
      kind,
    },
    ...[...children]
      .sort(
        (left, right) =>
          categorySeedCollator.compare(left.name, right.name) ||
          left.key.localeCompare(right.key),
      )
      .map((child) => ({
        id: financeCategorySeedId(child.key),
        key: child.key,
        name: child.name,
        kind,
        parentKey: parent.key,
      })),
  ]);

function assertDistinctParentAndChildNames(
  groups: readonly FinanceCategorySeedGroup[],
): void {
  for (const { parent, children } of groups) {
    const duplicate = children.find(
      (child) => categorySeedCollator.compare(parent.name, child.name) === 0,
    );
    if (duplicate) {
      throw new Error(
        `Finance category parent ${parent.key} and child ${duplicate.key} must have distinct names.`,
      );
    }
  }
}

function financeCategorySeedId(key: string): string {
  return (
    LEGACY_CATEGORY_IDS[key] ??
    `seed-finance-category-${key.toLowerCase().replaceAll("_", "-")}`
  );
}

export async function seedFinance(prisma: PrismaClient): Promise<void> {
  const result = await prisma.$transaction(
    async (tx) => {
      const anchor = await resolveFinanceAnchor(tx);
      const adminA = await tx.user.findFirst({
        where: {
          email: "admin@email.com",
          roles: { has: "ADMIN" },
          deletedAt: null,
        },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!adminA) {
        throw new Error(
          "The primary seed administrator must exist and be active first.",
        );
      }

      const adminB = await tx.user.upsert({
        where: { email: "finance-admin@example.com" },
        create: {
          id: FINANCE_SEED_IDS.secondAdmin,
          email: "finance-admin@example.com",
          firstName: "Maria",
          lastName: "Ionescu",
          roles: ["ADMIN"],
          createdAt: anchor,
        },
        update: {
          firstName: "Maria",
          lastName: "Ionescu",
          roles: ["ADMIN"],
          deletedAt: null,
          createdAt: anchor,
        },
        select: { id: true, firstName: true, lastName: true },
      });

      const [adminAWallet, adminBWallet] = await Promise.all([
        ensureUserWallet(
          tx,
          adminA.id,
          "seed-wallet-user-admin",
          userDisplayName(adminA),
        ),
        ensureUserWallet(
          tx,
          adminB.id,
          FINANCE_SEED_IDS.secondAdminWallet,
          userDisplayName(adminB),
        ),
      ]);

      const customers = await Promise.all([
        resolveSeedCustomer(tx, "seed-ana.popescu@example.com"),
        resolveSeedCustomer(tx, "seed-mihai.ionescu@example.com"),
        resolveSeedCustomer(tx, "seed-elena.marinescu@example.com"),
      ]);
      const [ana, mihai, elena] = customers;

      const people = await resolveFinancePeople(tx, anchor);

      for (const wallet of COMPANY_WALLETS) {
        await tx.wallet.upsert({
          where: { id: wallet.id },
          create: { ...wallet, isActive: true, createdAt: anchor },
          update: {
            type: wallet.type,
            name: wallet.name,
            isActive: true,
            createdAt: anchor,
          },
        });
        await ensureAuditEvent(tx, {
          id: `seed-audit-finance-wallet-${wallet.id}`,
          userId: adminA.id,
          type: "FINANCIAL_WALLET_CREATED",
          targetType: "wallet",
          targetId: wallet.id,
          createdAt: anchor,
          meta: { walletType: wallet.type, name: wallet.name },
        });
      }

      const operatingLegalEntityId = await ensureOperatingCompany(
        tx,
        adminA.id,
        anchor,
      );

      const companyCounterparties: Record<string, string> = {};
      for (const [key, company] of Object.entries(COMPANY_SEEDS)) {
        await ensureCompany(tx, company, anchor);
        companyCounterparties[key] = company.counterpartyId;
      }

      const categories: Record<string, string> = {};
      const categoryCodes: Record<string, string> = {};
      for (const category of CATEGORY_SEEDS) {
        const parentCategoryId = category.parentKey
          ? categories[category.parentKey]
          : null;
        if (category.parentKey && !parentCategoryId) {
          throw new Error(
            `Finance category ${category.key} references parent ${category.parentKey} before it is seeded.`,
          );
        }
        const code = categoryCodeFromPath({
          kind: category.kind,
          name: category.name,
          parentCode: category.parentKey
            ? categoryCodes[category.parentKey]
            : null,
        });
        const row = await ensureCategory(
          tx,
          category,
          code,
          parentCategoryId,
          anchor,
        );
        categories[category.key] = row.id;
        categoryCodes[category.key] = code;
        await ensureAuditEvent(tx, {
          id: `seed-audit-finance-category-${category.id.replace("seed-finance-category-", "")}`,
          userId: adminA.id,
          type: "FINANCIAL_CATEGORY_CREATED",
          targetType: "financialCategory",
          targetId: row.id,
          createdAt: anchor,
          meta: { code, kind: category.kind },
        });
      }

      const transactions = buildTransactions({
        adminA: { id: adminA.id, walletId: adminAWallet.id },
        adminB: { id: adminB.id, walletId: adminBWallet.id },
        ana,
        mihai,
        elena,
        categories,
        companyCounterparties,
        people,
        anchor,
      });
      validateManifest(transactions, people);
      const operatingActivity = validateOperatingCompanyActivity(transactions);

      await removeLegacyFinanceFixture(tx);

      for (const transaction of transactions) {
        await ensureSeedTransaction(tx, transaction);
      }
      await seedTransactionAudits(tx, transactions);
      await replayAffectedBalances(tx, transactions);

      return {
        anchor,
        operatingLegalEntityId,
        transactionCount: transactions.length,
        ...operatingActivity,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: TRANSACTION_TIMEOUT_MS,
    },
  );

  console.log(
    `Seeded ${result.transactionCount} finance transactions for JUSEM HUB SRL (${result.incomeCount} income, ${result.expenseCount} expenses) through legal entity ${result.operatingLegalEntityId}, anchored at ${result.anchor.toISOString()}.`,
  );
}

async function removeLegacyFinanceFixture(
  tx: Prisma.TransactionClient,
): Promise<void> {
  const legacy = await tx.moneyTransaction.findMany({
    where: { idempotencyKey: { startsWith: "seed:finance:v1:" } },
    select: {
      id: true,
      generatedTransactions: { select: { id: true } },
      reversals: { select: { id: true } },
    },
  });
  if (legacy.length === 0) return;
  const ids = [
    ...new Set(
      legacy.flatMap(({ id, generatedTransactions, reversals }) => [
        id,
        ...generatedTransactions.map((row) => row.id),
        ...reversals.map((row) => row.id),
      ]),
    ),
  ];
  await tx.auditEvent.deleteMany({ where: { targetId: { in: ids } } });
  await tx.walletBalanceChange.deleteMany({
    where: { moneyTransactionId: { in: ids } },
  });
  await tx.moneyTransactionReference.deleteMany({
    where: { moneyTransactionId: { in: ids } },
  });
  await tx.moneyTransaction.updateMany({
    where: { id: { in: ids }, originTransactionId: { in: ids } },
    data: { originTransactionId: null },
  });
  await tx.moneyTransaction.updateMany({
    where: { id: { in: ids }, reversalOfTransactionId: { in: ids } },
    data: { reversalOfTransactionId: null },
  });
  await tx.moneyTransaction.deleteMany({ where: { id: { in: ids } } });
}

async function resolveFinancePeople(
  tx: Prisma.TransactionClient,
  createdAt: Date,
): Promise<PersonFinanceSeed[]> {
  const people = await tx.person.findMany({
    where: { id: { startsWith: "seed-person-" } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      userId: true,
      deletedAt: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          wallet: { select: { id: true } },
        },
      },
      counterparty: { select: { id: true } },
    },
  });

  const result: PersonFinanceSeed[] = [];
  for (const person of people) {
    const wallet =
      person.user.wallet ??
      (await ensureUserWallet(
        tx,
        person.userId,
        `seed-wallet-${person.userId}`,
        userDisplayName(person.user),
      ));
    const counterparty = await tx.counterparty.upsert({
      where: { personId: person.id },
      create: {
        id: `seed-counterparty-${person.id}`,
        type: "PERSON",
        personId: person.id,
        isActive: person.deletedAt === null,
        createdAt,
      },
      update: { type: "PERSON", isActive: person.deletedAt === null },
      select: { id: true },
    });
    result.push({
      personId: person.id,
      userId: person.userId,
      walletId: wallet.id,
      counterpartyId: counterparty.id,
      deletedAt: person.deletedAt,
    });
  }
  return result;
}

async function ensureCompany(
  tx: Prisma.TransactionClient,
  seed: CompanySeed,
  createdAt: Date,
): Promise<void> {
  const companyData = {
    legalName: seed.legalName,
    tradingName: seed.tradingName,
    taxIdentifier: seed.taxIdentifier,
    taxIdentifierNormalized: seed.taxIdentifier.replace(/^RO/, ""),
    registrationNumber: seed.registrationNumber,
    email: seed.email,
    phone: seed.phone,
    phoneNormalized: seed.phone.replace(/\D/g, ""),
    addressLine1: seed.addressLine1,
    city: seed.city,
    region: seed.region,
    postalCode: seed.postalCode,
    countryCode: "RO",
    notes: seed.notes,
    isActive: true,
    deletedAt: null,
  };
  await tx.company.upsert({
    where: { id: seed.id },
    create: { id: seed.id, ...companyData, createdAt },
    update: companyData,
  });
  await tx.counterparty.upsert({
    where: { companyId: seed.id },
    create: {
      id: seed.counterpartyId,
      type: "COMPANY",
      companyId: seed.id,
      isActive: true,
      createdAt,
    },
    update: { type: "COMPANY", isActive: true },
  });
}

async function ensureOperatingCompany(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  createdAt: Date,
): Promise<string> {
  await ensureCompany(tx, OPERATING_COMPANY_SEED, createdAt);

  const legalEntity = await tx.businessLegalEntity.upsert({
    where: { companyId: OPERATING_COMPANY_SEED.id },
    create: {
      id: FINANCE_SEED_IDS.operatingLegalEntity,
      companyId: OPERATING_COMPANY_SEED.id,
      defaultCurrency: CURRENCY,
      isActive: true,
      createdAt,
    },
    update: { defaultCurrency: CURRENCY, isActive: true },
    select: { id: true },
  });

  for (const wallet of COMPANY_WALLETS) {
    const existing = await tx.businessLegalEntityWallet.findUnique({
      where: { walletId: wallet.id },
      select: { legalEntityId: true },
    });
    if (existing && existing.legalEntityId !== legalEntity.id) {
      throw new Error(
        `Finance seed wallet ${wallet.id} is already assigned to another business legal entity.`,
      );
    }
    if (!existing) {
      await tx.businessLegalEntityWallet.create({
        data: {
          id: `seed-business-legal-entity-wallet-jusem-${wallet.type.toLowerCase().replaceAll("_", "-")}`,
          legalEntityId: legalEntity.id,
          walletId: wallet.id,
          createdAt,
        },
      });
    }
  }

  await tx.businessOwner.upsert({
    where: {
      legalEntityId_userId_effectiveFrom: {
        legalEntityId: legalEntity.id,
        userId: ownerUserId,
        effectiveFrom: OPERATING_COMPANY_EFFECTIVE_FROM,
      },
    },
    create: {
      id: FINANCE_SEED_IDS.operatingCompanyOwner,
      legalEntityId: legalEntity.id,
      userId: ownerUserId,
      effectiveFrom: OPERATING_COMPANY_EFFECTIVE_FROM,
      createdAt,
    },
    update: { effectiveTo: null },
  });

  await tx.vatRegistrationPeriod.upsert({
    where: {
      legalEntityId_countryCode_vatNumber_effectiveFrom: {
        legalEntityId: legalEntity.id,
        countryCode: "RO",
        vatNumber: OPERATING_COMPANY_SEED.taxIdentifier,
        effectiveFrom: OPERATING_COMPANY_EFFECTIVE_FROM,
      },
    },
    create: {
      id: FINANCE_SEED_IDS.operatingCompanyVatPeriod,
      legalEntityId: legalEntity.id,
      countryCode: "RO",
      vatNumber: OPERATING_COMPANY_SEED.taxIdentifier,
      effectiveFrom: OPERATING_COMPANY_EFFECTIVE_FROM,
      createdAt,
    },
    update: { effectiveTo: null },
  });

  return legalEntity.id;
}

async function ensureCategory(
  tx: Prisma.TransactionClient,
  category: FinanceCategorySeed,
  code: string,
  parentCategoryId: string | null,
  createdAt: Date,
): Promise<{ id: string }> {
  const matches = await tx.financialCategory.findMany({
    where: { OR: [{ id: category.id }, { code }] },
    select: { id: true },
  });
  if (matches.length > 1) {
    throw new Error(
      `Finance category ${code} conflicts with the fixed seed ID ${category.id}.`,
    );
  }

  const data = {
    code,
    name: category.name,
    kind: category.kind,
    parentCategoryId,
    isActive: true,
    createdAt,
  };
  if (matches[0]) {
    return tx.financialCategory.update({
      where: { id: matches[0].id },
      data,
      select: { id: true },
    });
  }
  return tx.financialCategory.create({
    data: { id: category.id, ...data },
    select: { id: true },
  });
}

async function ensureUserWallet(
  tx: Prisma.TransactionClient,
  userId: string,
  createId: string,
  ownerName: string,
) {
  const walletName = `${ownerName} — ${USER_WALLET_SUFFIX}`;
  const wallet = await tx.wallet.upsert({
    where: { ownerUserId: userId },
    create: {
      id: createId,
      type: FinanceWalletType.USER,
      ownerUserId: userId,
      name: walletName,
    },
    update: {
      type: FinanceWalletType.USER,
      name: walletName,
      isActive: true,
    },
    select: { id: true },
  });
  await tx.walletBalance.upsert({
    where: {
      walletId_bucket_currency: {
        walletId: wallet.id,
        bucket: BalanceBucket.USER_SETTLEMENT,
        currency: CURRENCY,
      },
    },
    create: {
      walletId: wallet.id,
      bucket: BalanceBucket.USER_SETTLEMENT,
      currency: CURRENCY,
      balance: 0,
    },
    update: {},
  });
  return wallet;
}

async function resolveSeedCustomer(
  tx: Prisma.TransactionClient,
  email: string,
): Promise<{ id: string; walletId: string }> {
  const user = await tx.user.findUnique({
    where: { email, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      wallet: { select: { id: true } },
    },
  });
  if (!user) throw new Error(`Finance seed customer ${email} was not found.`);
  const wallet =
    user.wallet ??
    (await ensureUserWallet(
      tx,
      user.id,
      `seed-wallet-${user.id}`,
      userDisplayName(user),
    ));
  return { id: user.id, walletId: wallet.id };
}

function userDisplayName(user: {
  firstName: string | null;
  lastName: string | null;
}): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ");
}

async function resolveFinanceAnchor(
  tx: Prisma.TransactionClient,
): Promise<Date> {
  const existing = await tx.moneyTransaction.findUnique({
    where: { id: ANCHOR_TRANSACTION_ID },
    select: { occurredAt: true },
  });
  const requested = parseRequestedAnchor();

  if (existing) {
    if (requested && requested.getTime() !== existing.occurredAt.getTime()) {
      throw new Error(
        `FINANCE_SEED_ANCHOR differs from the immutable ${FINANCE_SEED_VERSION} fixture anchor ${existing.occurredAt.toISOString()}.`,
      );
    }
    return existing.occurredAt;
  }
  return requested ?? new Date();
}

function parseRequestedAnchor(): Date | null {
  const raw = process.env.FINANCE_SEED_ANCHOR?.trim();
  if (!raw) return null;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new Error("FINANCE_SEED_ANCHOR must be a valid ISO timestamp.");
  }
  return value;
}

function buildTransactions(context: FinanceSeedContext): SeedTransaction[] {
  const {
    adminA,
    adminB,
    ana,
    mihai,
    elena,
    categories,
    companyCounterparties,
    people,
    anchor,
  } = context;
  const current = (position: number) => currentPeriodDate(anchor, position);
  const previous = (position: number) => previousPeriodDate(anchor, position);
  const cash = FINANCE_SEED_IDS.cashWallet;
  const bank = FINANCE_SEED_IDS.bankWallet;
  const processor = FINANCE_SEED_IDS.processorWallet;
  const posted = MoneyTransactionStatus.POSTED;
  const company = MoneyTransactionScope.COMPANY;
  const business = BalanceBucket.BUSINESS_FUNDS;
  const personal = BalanceBucket.ADMIN_PERSONAL_FUNDS;
  const settlement = BalanceBucket.USER_SETTLEMENT;
  const notApplicable = BillingStatus.NOT_APPLICABLE;
  const transactions: SeedTransaction[] = [];

  const companyExpenses = [
    [
      "parts-order",
      "2860.00",
      "SCOOTER_PARTS",
      "partsMoto",
      0.225,
      "Comanda de placute, filtre si curele de transmisie",
    ],
    [
      "tires-order",
      "1940.00",
      "SCOOTER_TIRES",
      "motoDepozit",
      0.235,
      "Anvelope si baterii pentru flota",
    ],
    [
      "partner-service",
      "1680.00",
      "SCOOTER_REPAIRS",
      "service",
      0.245,
      "Reparatii efectuate de atelierul partener",
    ],
    [
      "fleet-rca",
      "3210.00",
      "SCOOTER_INSURANCE",
      "insuranceA",
      0.255,
      "Prime RCA pentru flota de scutere",
    ],
    [
      "insurance-broker",
      "480.00",
      "COMPANY_LAWYER",
      "insuranceB",
      0.265,
      "Servicii brokeraj si administrare polite",
    ],
    [
      "shop-internet",
      "189.00",
      "COMPANY_INTERNET",
      "internet",
      0.275,
      "Abonament lunar internet magazin si service",
    ],
    [
      "shop-rent",
      "4200.00",
      "RENT_AND_UTILITIES",
      "landlord",
      0.285,
      "Chirie lunara pentru spatiul magazinului si atelierului",
    ],
  ] as const;
  for (const [
    slug,
    amount,
    category,
    counterparty,
    position,
    description,
  ] of companyExpenses) {
    transactions.push(
      seedTransaction(`counterparty-${slug}`, {
        type: MoneyTransactionType.EXPENSE,
        status: posted,
        amount,
        financialScope: company,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        billingStatus: BillingStatus.BILLED,
        categoryId: categories[category],
        counterpartyUserId: null,
        counterpartyId: companyCounterparties[counterparty],
        recipientUserId: null,
        debtorUserId: null,
        creditorUserId: null,
        recordedByUserId: adminA.id,
        occurredAt: current(position),
        description,
        originTransactionId: null,
        reversalOfTransactionId: null,
        balanceChanges: [
          { walletId: bank, bucket: business, amountDelta: `-${amount}` },
        ],
        references: [
          {
            referenceType: "company",
            referenceId: COMPANY_SEEDS[counterparty].id,
            isPrimary: true,
          },
        ],
      }),
    );
  }

  transactions.push(
    seedTransaction("previous-bank-income", {
      type: MoneyTransactionType.INCOME,
      status: posted,
      amount: "5000.00",
      financialScope: company,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      billingStatus: BillingStatus.BILLED,
      categoryId: categories.RENTAL_REVENUE,
      counterpartyUserId: null,
      recipientUserId: null,
      debtorUserId: null,
      creditorUserId: null,
      recordedByUserId: adminA.id,
      occurredAt: previous(0.35),
      description: "Corporate scooter rentals collected by bank transfer",
      originTransactionId: null,
      reversalOfTransactionId: null,
      balanceChanges: [
        { walletId: bank, bucket: business, amountDelta: "5000.00" },
      ],
      references: [],
    }),
    seedTransaction("previous-bank-maintenance", {
      type: MoneyTransactionType.EXPENSE,
      status: posted,
      amount: "1200.00",
      financialScope: company,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      billingStatus: BillingStatus.BILLED,
      categoryId: categories.MAINTENANCE,
      counterpartyUserId: null,
      recipientUserId: null,
      debtorUserId: null,
      creditorUserId: null,
      recordedByUserId: adminA.id,
      occurredAt: previous(0.72),
      description: "Scheduled fleet service from the previous month",
      originTransactionId: null,
      reversalOfTransactionId: null,
      balanceChanges: [
        { walletId: bank, bucket: business, amountDelta: "-1200.00" },
      ],
      references: [],
    }),
  );

  const incomeRows: Array<{
    slug: string;
    amount: string;
    walletId: string;
    paymentMethod: PaymentMethod;
    recorder: string;
    position: number;
    description: string;
  }> = [
    {
      slug: "admin-a-cash-income",
      amount: "4800.00",
      walletId: adminA.walletId,
      paymentMethod: PaymentMethod.CASH,
      recorder: adminA.id,
      position: 0.04,
      description: "Walk-in rental income collected by Admin",
    },
    {
      slug: "admin-b-cash-income",
      amount: "3650.00",
      walletId: adminB.walletId,
      paymentMethod: PaymentMethod.CASH,
      recorder: adminB.id,
      position: 0.08,
      description: "Weekend rental income collected by Maria Ionescu",
    },
    {
      slug: "company-bank-income",
      amount: "9200.00",
      walletId: bank,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      recorder: adminA.id,
      position: 0.12,
      description: "Monthly corporate rental contracts",
    },
    {
      slug: "processor-online-income",
      amount: "2750.00",
      walletId: processor,
      paymentMethod: PaymentMethod.ONLINE_PAYMENT,
      recorder: adminB.id,
      position: 0.16,
      description: "Online rental checkout settlements",
    },
    {
      slug: "processor-pos-income",
      amount: "1250.00",
      walletId: processor,
      paymentMethod: PaymentMethod.POS,
      recorder: adminB.id,
      position: 0.2,
      description: "Card terminal rental payments",
    },
  ];
  for (const row of incomeRows) {
    transactions.push(
      seedTransaction(row.slug, {
        type: MoneyTransactionType.INCOME,
        status: posted,
        amount: row.amount,
        financialScope: company,
        paymentMethod: row.paymentMethod,
        billingStatus: BillingStatus.BILLED,
        categoryId: categories.RENTAL_REVENUE,
        counterpartyUserId: null,
        recipientUserId: null,
        debtorUserId: null,
        creditorUserId: null,
        recordedByUserId: row.recorder,
        occurredAt: current(row.position),
        description: row.description,
        originTransactionId: null,
        reversalOfTransactionId: null,
        balanceChanges: [
          { walletId: row.walletId, bucket: business, amountDelta: row.amount },
        ],
        references: [],
      }),
    );
  }

  const expenseRows: Array<{
    slug: string;
    amount: string;
    walletId: string;
    method: PaymentMethod;
    categoryId: string | null;
    recorder: string;
    position: number;
    description: string;
  }> = [
    {
      slug: "admin-a-fuel-expense",
      amount: "620.00",
      walletId: adminA.walletId,
      method: PaymentMethod.CASH,
      categoryId: categories.FUEL,
      recorder: adminA.id,
      position: 0.27,
      description: "Fuel for the combustion scooter fleet",
    },
    {
      slug: "admin-b-cleaning-expense",
      amount: "340.00",
      walletId: adminB.walletId,
      method: PaymentMethod.CASH,
      categoryId: categories.CLEANING,
      recorder: adminB.id,
      position: 0.3,
      description: "Scooter cleaning and detailing supplies",
    },
    {
      slug: "company-rent-expense",
      amount: "2400.00",
      walletId: bank,
      method: PaymentMethod.BANK_TRANSFER,
      categoryId: categories.RENT_AND_UTILITIES,
      recorder: adminA.id,
      position: 0.34,
      description: "Workshop rent and utilities",
    },
    {
      slug: "company-maintenance-expense",
      amount: "1350.00",
      walletId: bank,
      method: PaymentMethod.BANK_TRANSFER,
      categoryId: categories.MAINTENANCE,
      recorder: adminA.id,
      position: 0.38,
      description: "Parts and scheduled scooter servicing",
    },
    {
      slug: "processor-fee-expense",
      amount: "190.00",
      walletId: processor,
      method: PaymentMethod.ONLINE_PAYMENT,
      categoryId: categories.PAYMENT_PROCESSING,
      recorder: adminB.id,
      position: 0.42,
      description: "Online payment processing fees",
    },
  ];
  for (const row of expenseRows) {
    transactions.push(
      seedTransaction(row.slug, {
        type: MoneyTransactionType.EXPENSE,
        status: posted,
        amount: row.amount,
        financialScope: company,
        paymentMethod: row.method,
        billingStatus: BillingStatus.BILLED,
        categoryId: row.categoryId,
        counterpartyUserId: null,
        recipientUserId: null,
        debtorUserId: null,
        creditorUserId: null,
        recordedByUserId: row.recorder,
        occurredAt: current(row.position),
        description: row.description,
        originTransactionId: null,
        reversalOfTransactionId: null,
        balanceChanges: [
          {
            walletId: row.walletId,
            bucket: business,
            amountDelta: `-${row.amount}`,
          },
        ],
        references: [],
      }),
    );
  }

  transactions.push(
    transfer(
      "admin-a-to-bank",
      "2500.00",
      adminA.walletId,
      bank,
      adminA.id,
      current(0.48),
      "Cash deposited by Admin into the company bank account",
    ),
    transfer(
      "admin-b-to-cash-desk",
      "1800.00",
      adminB.walletId,
      cash,
      adminB.id,
      current(0.51),
      "Maria handed collected cash to the main cash desk",
    ),
    transfer(
      "processor-to-bank",
      "2000.00",
      processor,
      bank,
      adminB.id,
      current(0.54),
      "Online processor payout to the company bank account",
    ),
  );

  transactions.push(
    seedTransaction("ana-rental-charge", {
      type: MoneyTransactionType.USER_CHARGE,
      status: posted,
      amount: "780.00",
      financialScope: company,
      paymentMethod: null,
      billingStatus: BillingStatus.BILLED,
      categoryId: categories.RENTAL_REVENUE,
      counterpartyUserId: ana.id,
      recipientUserId: null,
      debtorUserId: null,
      creditorUserId: null,
      recordedByUserId: adminA.id,
      occurredAt: current(0.58),
      description: "Ana Popescu rental charge",
      originTransactionId: null,
      reversalOfTransactionId: null,
      balanceChanges: [
        { walletId: ana.walletId, bucket: settlement, amountDelta: "-780.00" },
      ],
      references: personAndScooterReferences(
        "seed-person-ana-popescu",
        "seed-scooter-generated-0001",
      ),
    }),
    customerCashMovement(
      "ana-payment",
      MoneyTransactionType.USER_PAYMENT,
      "900.00",
      ana,
      cash,
      adminA.id,
      current(0.61),
      "Ana Popescu cash payment",
      "900.00",
    ),
    customerCashMovement(
      "ana-refund",
      MoneyTransactionType.REFUND,
      "120.00",
      ana,
      cash,
      adminA.id,
      current(0.64),
      "Refund of Ana Popescu's overpayment",
      "-120.00",
    ),
    seedTransaction("elena-rental-charge", {
      type: MoneyTransactionType.USER_CHARGE,
      status: posted,
      amount: "600.00",
      financialScope: company,
      paymentMethod: null,
      billingStatus: BillingStatus.BILLED,
      categoryId: categories.RENTAL_REVENUE,
      counterpartyUserId: elena.id,
      recipientUserId: null,
      debtorUserId: null,
      creditorUserId: null,
      recordedByUserId: adminB.id,
      occurredAt: current(0.67),
      description: "Elena Marinescu rental charge",
      originTransactionId: null,
      reversalOfTransactionId: null,
      balanceChanges: [
        {
          walletId: elena.walletId,
          bucket: settlement,
          amountDelta: "-600.00",
        },
      ],
      references: personAndScooterReferences(
        "seed-person-elena-marinescu",
        "seed-scooter-generated-0002",
      ),
    }),
    customerCashMovement(
      "elena-payment",
      MoneyTransactionType.USER_PAYMENT,
      "350.00",
      elena,
      processor,
      adminB.id,
      current(0.7),
      "Elena Marinescu partial online payment",
      "350.00",
      PaymentMethod.ONLINE_PAYMENT,
    ),
    guaranteeMovement(
      "mihai-guarantee-received",
      MoneyTransactionType.GUARANTEE_RECEIVED,
      "700.00",
      mihai,
      cash,
      adminA.id,
      current(0.73),
      "Refundable guarantee received from Mihai Ionescu",
      "700.00",
    ),
    guaranteeMovement(
      "mihai-guarantee-refunded",
      MoneyTransactionType.GUARANTEE_REFUNDED,
      "250.00",
      mihai,
      cash,
      adminA.id,
      current(0.77),
      "Partial guarantee refund to Mihai Ionescu",
      "-250.00",
    ),
  );

  const personalIncome = seedTransaction("admin-a-personal-income", {
    type: MoneyTransactionType.INCOME,
    status: posted,
    amount: "1200.00",
    financialScope: MoneyTransactionScope.ADMIN_PERSONAL,
    paymentMethod: PaymentMethod.CASH,
    billingStatus: BillingStatus.NOT_BILLED,
    categoryId: categories.RENTAL_INCOME,
    counterpartyUserId: null,
    recipientUserId: null,
    debtorUserId: null,
    creditorUserId: null,
    recordedByUserId: adminA.id,
    occurredAt: current(0.8),
    description: "Unbilled personal rental cash collected by Admin",
    originTransactionId: null,
    reversalOfTransactionId: null,
    balanceChanges: [
      { walletId: adminA.walletId, bucket: personal, amountDelta: "1200.00" },
    ],
    references: [],
  });
  transactions.push(personalIncome);
  transactions.push(
    seedTransaction("admin-a-personal-claim", {
      type: MoneyTransactionType.PERSONAL_FUNDS_CLAIM,
      status: posted,
      amount: "600.00",
      financialScope: MoneyTransactionScope.ADMIN_PERSONAL,
      paymentMethod: null,
      billingStatus: notApplicable,
      categoryId: null,
      counterpartyUserId: null,
      recipientUserId: null,
      debtorUserId: adminA.id,
      creditorUserId: adminB.id,
      recordedByUserId: adminA.id,
      occurredAt: personalIncome.occurredAt,
      description: `Automatic personal-funds share from ${personalIncome.id}`,
      idempotencyKey: `auto-claim:${personalIncome.id}:${adminB.id}`,
      originTransactionId: personalIncome.id,
      reversalOfTransactionId: null,
      balanceChanges: [],
      references: [],
    }),
    seedTransaction("admin-claim-partial-settlement", {
      type: MoneyTransactionType.PERSONAL_FUNDS_SPLIT,
      status: posted,
      amount: "400.00",
      financialScope: MoneyTransactionScope.ADMIN_PERSONAL,
      paymentMethod: PaymentMethod.CASH,
      billingStatus: notApplicable,
      categoryId: null,
      counterpartyUserId: null,
      recipientUserId: null,
      debtorUserId: adminA.id,
      creditorUserId: adminB.id,
      recordedByUserId: adminA.id,
      occurredAt: current(0.84),
      description: "Partial settlement of personal rental proceeds",
      originTransactionId: null,
      reversalOfTransactionId: null,
      balanceChanges: [
        { walletId: adminA.walletId, bucket: personal, amountDelta: "-400.00" },
        { walletId: adminB.walletId, bucket: personal, amountDelta: "400.00" },
      ],
      references: [],
    }),
    seedTransaction("admin-b-reimbursement", {
      type: MoneyTransactionType.REIMBURSEMENT,
      status: posted,
      amount: "300.00",
      financialScope: company,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      billingStatus: notApplicable,
      categoryId: null,
      counterpartyUserId: null,
      recipientUserId: adminB.id,
      debtorUserId: null,
      creditorUserId: null,
      recordedByUserId: adminA.id,
      occurredAt: current(0.87),
      description: "Reimbursement to Maria for company supplies",
      originTransactionId: null,
      reversalOfTransactionId: null,
      balanceChanges: [
        { walletId: bank, bucket: business, amountDelta: "-300.00" },
        { walletId: adminB.walletId, bucket: personal, amountDelta: "300.00" },
      ],
      references: [],
    }),
    seedTransaction("admin-b-personal-expense", {
      type: MoneyTransactionType.EXPENSE,
      status: posted,
      amount: "180.00",
      financialScope: MoneyTransactionScope.ADMIN_PERSONAL,
      paymentMethod: PaymentMethod.CASH,
      billingStatus: BillingStatus.NOT_BILLED,
      categoryId: categories.ADMINISTRATOR_EXPENSE,
      counterpartyUserId: null,
      recipientUserId: null,
      debtorUserId: null,
      creditorUserId: null,
      recordedByUserId: adminB.id,
      occurredAt: current(0.9),
      description: "Maria's personal operational expense",
      originTransactionId: null,
      reversalOfTransactionId: null,
      balanceChanges: [
        { walletId: adminB.walletId, bucket: personal, amountDelta: "-180.00" },
      ],
      references: [],
    }),
    seedTransaction("admin-a-personal-extraction", {
      type: MoneyTransactionType.PERSONAL_EXTRACTION,
      status: posted,
      amount: "250.00",
      financialScope: MoneyTransactionScope.ADMIN_PERSONAL,
      paymentMethod: PaymentMethod.CASH,
      billingStatus: notApplicable,
      categoryId: null,
      counterpartyUserId: null,
      recipientUserId: adminA.id,
      debtorUserId: null,
      creditorUserId: null,
      recordedByUserId: adminA.id,
      occurredAt: current(0.92),
      description: "Personal cash extracted by Admin",
      originTransactionId: null,
      reversalOfTransactionId: null,
      balanceChanges: [
        { walletId: adminA.walletId, bucket: personal, amountDelta: "-250.00" },
      ],
      references: [],
    }),
    // This v1 fixture row intentionally predates required expense categories.
    seedTransaction("uncategorized-cash-expense", {
      type: MoneyTransactionType.EXPENSE,
      status: posted,
      amount: "75.00",
      financialScope: company,
      paymentMethod: PaymentMethod.CASH,
      billingStatus: BillingStatus.BILLED,
      categoryId: null,
      counterpartyUserId: null,
      recipientUserId: null,
      debtorUserId: null,
      creditorUserId: null,
      recordedByUserId: adminB.id,
      occurredAt: current(0.94),
      description: "Small uncategorized cash purchase",
      originTransactionId: null,
      reversalOfTransactionId: null,
      balanceChanges: [
        { walletId: cash, bucket: business, amountDelta: "-75.00" },
      ],
      references: [],
    }),
  );

  const mistakenIncome = seedTransaction("mistaken-cash-income", {
    type: MoneyTransactionType.INCOME,
    status: MoneyTransactionStatus.REVERSED,
    amount: "300.00",
    financialScope: company,
    paymentMethod: PaymentMethod.CASH,
    billingStatus: BillingStatus.BILLED,
    categoryId: categories.RENTAL_REVENUE,
    counterpartyUserId: null,
    recipientUserId: null,
    debtorUserId: null,
    creditorUserId: null,
    recordedByUserId: adminB.id,
    occurredAt: current(0.95),
    description: "Duplicate cash entry later reversed",
    originTransactionId: null,
    reversalOfTransactionId: null,
    balanceChanges: [
      { walletId: cash, bucket: business, amountDelta: "300.00" },
    ],
    references: [],
  });
  transactions.push(mistakenIncome);
  transactions.push(
    seedTransaction("mistaken-cash-income-reversal", {
      type: MoneyTransactionType.REVERSAL,
      status: posted,
      amount: "300.00",
      financialScope: company,
      paymentMethod: null,
      billingStatus: notApplicable,
      categoryId: null,
      counterpartyUserId: null,
      recipientUserId: null,
      debtorUserId: null,
      creditorUserId: null,
      recordedByUserId: adminB.id,
      occurredAt: current(0.96),
      description: `Reversal of transaction ${mistakenIncome.id}`,
      originTransactionId: null,
      reversalOfTransactionId: mistakenIncome.id,
      balanceChanges: [
        { walletId: cash, bucket: business, amountDelta: "-300.00" },
      ],
      references: [],
    }),
    seedTransaction("draft-maintenance", {
      type: MoneyTransactionType.EXPENSE,
      status: MoneyTransactionStatus.DRAFT,
      amount: "950.00",
      financialScope: company,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      billingStatus: BillingStatus.BILLED,
      categoryId: categories.MAINTENANCE,
      counterpartyUserId: null,
      recipientUserId: null,
      debtorUserId: null,
      creditorUserId: null,
      recordedByUserId: adminA.id,
      occurredAt: anchor,
      description: "Draft estimate for next fleet maintenance visit",
      originTransactionId: null,
      reversalOfTransactionId: null,
      balanceChanges: [
        { walletId: bank, bucket: business, amountDelta: "-950.00" },
      ],
      references: [],
    }),
  );

  transactions.push(
    ...buildPersonRentalTransactions({
      people,
      categories,
      anchor,
      adminA,
      adminB,
    }),
    ...buildMechanicTransactions({ people, categories, anchor, adminA }),
    ...buildCourierTransactions({ people, categories, anchor, adminB }),
    ...buildRecurringCompanyTransactions({
      categories,
      companyCounterparties,
      anchor,
      adminA,
    }),
    ...buildOperatingTransactions({ categories, anchor, adminA, adminB }),
  );

  return transactions.filter((transaction) => transaction.id.includes("-v2-"));
}

type ScenarioContext = Pick<
  FinanceSeedContext,
  "people" | "categories" | "anchor" | "adminA" | "adminB"
>;

function buildPersonRentalTransactions(
  context: ScenarioContext,
): SeedTransaction[] {
  const { people, categories, anchor, adminA, adminB } = context;
  return people.flatMap((person, index) => {
    const rate = index % 7 === 0 ? "250.00" : "300.00";
    const hasPenalty = index % 6 === 0;
    const followUpAmount = hasPenalty
      ? (["50.00", "75.00", "100.00"] as const)[index % 3]
      : rate;
    const scooterA = `seed-scooter-generated-${String((index % 195) + 1).padStart(4, "0")}`;
    const scooterB = `seed-scooter-generated-${String(((index + 47) % 195) + 1).padStart(4, "0")}`;
    const recorder = index % 2 === 0 ? adminA.id : adminB.id;
    const paymentWallet =
      index % 3 === 0
        ? FINANCE_SEED_IDS.processorWallet
        : FINANCE_SEED_IDS.cashWallet;
    const start = rentalStart(anchor, person, index);
    const common = {
      person,
      recorder,
      rate,
      categories,
    };
    return [
      rentalEvent(`v2-rental-${index + 1}-charge`, common, {
        type: MoneyTransactionType.USER_CHARGE,
        amount: rate,
        occurredAt: addDays(start, 0),
        scooterId: scooterA,
        categoryId: categories.RENTAL_REVENUE,
        description: `Inchiriere saptamanala scuter - ${rate} RON`,
        changes: [
          {
            walletId: person.walletId,
            bucket: BalanceBucket.USER_SETTLEMENT,
            amountDelta: `-${rate}`,
          },
        ],
      }),
      rentalEvent(`v2-rental-${index + 1}-deposit`, common, {
        type: MoneyTransactionType.GUARANTEE_RECEIVED,
        amount: "200.00",
        occurredAt: addDays(start, 0),
        scooterId: scooterA,
        categoryId: null,
        description: "Garantie inchiriere saptamanala - 200 RON",
        changes: [
          {
            walletId: person.walletId,
            bucket: BalanceBucket.USER_SETTLEMENT,
            amountDelta: "200.00",
          },
          {
            walletId: FINANCE_SEED_IDS.cashWallet,
            bucket: BalanceBucket.CUSTOMER_GUARANTEE_FUNDS,
            amountDelta: "200.00",
          },
        ],
      }),
      rentalEvent(`v2-rental-${index + 1}-payment`, common, {
        type: MoneyTransactionType.USER_PAYMENT,
        amount: rate,
        occurredAt: addDays(start, 0),
        scooterId: scooterA,
        categoryId: null,
        description: `Plata inchiriere saptamanala - ${rate} RON`,
        changes: [
          {
            walletId: person.walletId,
            bucket: BalanceBucket.USER_SETTLEMENT,
            amountDelta: rate,
          },
          {
            walletId: paymentWallet,
            bucket: BalanceBucket.BUSINESS_FUNDS,
            amountDelta: rate,
          },
        ],
      }),
      rentalEvent(`v2-rental-${index + 1}-deposit-refund`, common, {
        type: MoneyTransactionType.GUARANTEE_REFUNDED,
        amount: "200.00",
        occurredAt: addDays(start, 7),
        scooterId: scooterA,
        categoryId: null,
        description: "Restituire integrala garantie - 200 RON",
        changes: [
          {
            walletId: person.walletId,
            bucket: BalanceBucket.USER_SETTLEMENT,
            amountDelta: "-200.00",
          },
          {
            walletId: FINANCE_SEED_IDS.cashWallet,
            bucket: BalanceBucket.CUSTOMER_GUARANTEE_FUNDS,
            amountDelta: "-200.00",
          },
        ],
      }),
      rentalEvent(`v2-rental-${index + 1}-second-charge`, common, {
        type: MoneyTransactionType.USER_CHARGE,
        amount: followUpAmount,
        occurredAt: addDays(start, 21),
        scooterId: hasPenalty ? scooterA : scooterB,
        categoryId: hasPenalty
          ? categories.RENTAL_LATE_FEE
          : categories.RENTAL_REVENUE,
        description: hasPenalty
          ? `Penalitate predare cu intarziere - ${followUpAmount} RON`
          : `A doua inchiriere saptamanala - ${rate} RON`,
        changes: [
          {
            walletId: person.walletId,
            bucket: BalanceBucket.USER_SETTLEMENT,
            amountDelta: `-${followUpAmount}`,
          },
        ],
      }),
      rentalEvent(`v2-rental-${index + 1}-second-payment`, common, {
        type: MoneyTransactionType.USER_PAYMENT,
        amount: followUpAmount,
        occurredAt: addDays(start, 21),
        scooterId: hasPenalty ? scooterA : scooterB,
        categoryId: null,
        description: hasPenalty
          ? `Plata penalitate predare cu intarziere - ${followUpAmount} RON`
          : `Plata a doua inchiriere saptamanala - ${rate} RON`,
        changes: [
          {
            walletId: person.walletId,
            bucket: BalanceBucket.USER_SETTLEMENT,
            amountDelta: followUpAmount,
          },
          {
            walletId: paymentWallet,
            bucket: BalanceBucket.BUSINESS_FUNDS,
            amountDelta: followUpAmount,
          },
        ],
      }),
    ];
  });
}

function rentalEvent(
  slug: string,
  common: {
    person: PersonFinanceSeed;
    recorder: string;
    rate: string;
    categories: Record<string, string>;
  },
  event: {
    type: MoneyTransactionType;
    amount: string;
    occurredAt: Date;
    scooterId: string;
    categoryId: string | null;
    description: string;
    changes: Array<Omit<SeedBalanceChange, "id">>;
  },
): SeedTransaction {
  const paymentMethod =
    event.type === MoneyTransactionType.USER_CHARGE ? null : PaymentMethod.CASH;
  return seedTransaction(slug, {
    type: event.type,
    status: MoneyTransactionStatus.POSTED,
    amount: event.amount,
    financialScope:
      event.type === MoneyTransactionType.GUARANTEE_RECEIVED ||
      event.type === MoneyTransactionType.GUARANTEE_REFUNDED
        ? MoneyTransactionScope.CUSTOMER_HELD
        : MoneyTransactionScope.COMPANY,
    paymentMethod,
    billingStatus:
      event.type === MoneyTransactionType.USER_CHARGE
        ? BillingStatus.BILLED
        : BillingStatus.NOT_APPLICABLE,
    categoryId: event.categoryId,
    counterpartyUserId: common.person.userId,
    counterpartyId: common.person.counterpartyId,
    recipientUserId: null,
    debtorUserId: null,
    creditorUserId: null,
    recordedByUserId: common.recorder,
    occurredAt: event.occurredAt,
    description: event.description,
    originTransactionId: null,
    reversalOfTransactionId: null,
    balanceChanges: event.changes,
    references: personAndScooterReferences(
      common.person.personId,
      event.scooterId,
    ),
  });
}

function buildMechanicTransactions(
  context: Omit<ScenarioContext, "adminB">,
): SeedTransaction[] {
  const mechanics = context.people
    .filter((_, index) => index % 15 === 0)
    .slice(0, 8);
  const jobs = [
    ["revizie", "180.00", "MAINTENANCE", "Manopera revizie periodica"],
    ["frane", "220.00", "SCOOTER_REPAIRS", "Manopera reparatie sistem franare"],
    ["diagnoza", "150.00", "SCOOTER_REPAIRS", "Diagnoza electrica"],
    ["urgenta", "280.00", "SCOOTER_REPAIRS", "Interventie mecanica de urgenta"],
    [
      "pregatire",
      "160.00",
      "MAINTENANCE",
      "Pregatire scuter pentru inchiriere",
    ],
  ] as const;
  return mechanics.flatMap((person, mechanicIndex) =>
    jobs.map(([job, amount, category, description], jobIndex) =>
      seedTransaction(`v2-mechanic-${mechanicIndex + 1}-${job}`, {
        type: MoneyTransactionType.EXPENSE,
        status: MoneyTransactionStatus.POSTED,
        amount,
        financialScope: MoneyTransactionScope.COMPANY,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        billingStatus: BillingStatus.BILLED,
        categoryId: context.categories[category],
        counterpartyUserId: person.userId,
        counterpartyId: person.counterpartyId,
        recipientUserId: person.userId,
        debtorUserId: null,
        creditorUserId: null,
        recordedByUserId: context.adminA.id,
        occurredAt: historicalDate(
          context.anchor,
          mechanicIndex * 5 + jobIndex,
          40,
        ),
        description,
        originTransactionId: null,
        reversalOfTransactionId: null,
        balanceChanges: [
          {
            walletId: FINANCE_SEED_IDS.bankWallet,
            bucket: BalanceBucket.BUSINESS_FUNDS,
            amountDelta: `-${amount}`,
          },
        ],
        references: personAndScooterReferences(
          person.personId,
          `seed-scooter-generated-${String(((mechanicIndex * 19 + jobIndex) % 195) + 1).padStart(4, "0")}`,
        ),
      }),
    ),
  );
}

function buildCourierTransactions(
  context: Omit<ScenarioContext, "adminA">,
): SeedTransaction[] {
  const couriers = context.people
    .filter((_, index) => index % 5 === 1)
    .slice(0, 24);
  const platforms = ["DELIVERY_BOLT", "DELIVERY_GLOVO"] as const;
  return couriers.flatMap((person, courierIndex) =>
    platforms.map((category, settlementIndex) => {
      const amount = settlementIndex === 0 ? "640.00" : "780.00";
      return seedTransaction(
        `v2-courier-${courierIndex + 1}-${settlementIndex + 1}`,
        {
          type: MoneyTransactionType.INCOME,
          status: MoneyTransactionStatus.POSTED,
          amount,
          financialScope: MoneyTransactionScope.COMPANY,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          billingStatus: BillingStatus.BILLED,
          categoryId: context.categories[category],
          counterpartyUserId: person.userId,
          counterpartyId: person.counterpartyId,
          recipientUserId: null,
          debtorUserId: null,
          creditorUserId: null,
          recordedByUserId: context.adminB.id,
          occurredAt: historicalDate(
            context.anchor,
            courierIndex * 2 + settlementIndex,
            48,
          ),
          description: `${category === "DELIVERY_BOLT" ? "Bolt" : "Glovo"} - venit saptamanal generat de curier`,
          originTransactionId: null,
          reversalOfTransactionId: null,
          balanceChanges: [
            {
              walletId: FINANCE_SEED_IDS.bankWallet,
              bucket: BalanceBucket.BUSINESS_FUNDS,
              amountDelta: amount,
            },
          ],
          references: personAndScooterReferences(
            person.personId,
            `seed-scooter-generated-${String(((courierIndex * 7 + settlementIndex) % 195) + 1).padStart(4, "0")}`,
          ),
        },
      );
    }),
  );
}

function buildRecurringCompanyTransactions(context: {
  categories: Record<string, string>;
  companyCounterparties: Record<string, string>;
  anchor: Date;
  adminA: { id: string };
}): SeedTransaction[] {
  const profiles: Record<
    keyof typeof COMPANY_SEEDS,
    { category: string; base: number; descriptions: readonly string[] }
  > = {
    partsMoto: {
      category: "SCOOTER_PARTS",
      base: 740,
      descriptions: [
        "Filtre si bujii",
        "Curele transmisie",
        "Placute frana",
        "Role variator",
        "Oglinzi si manete",
        "Consumabile service",
        "Kituri revizie",
        "Comanda piese caroserie",
        "Retur piese incompatibile",
        "Stoc sezonier piese",
      ],
    },
    motoDepozit: {
      category: "SCOOTER_TIRES",
      base: 980,
      descriptions: [
        "Anvelope fata",
        "Anvelope spate",
        "Baterii scuter",
        "Valve si consumabile",
        "Seturi anvelope ploaie",
        "Comanda baterii AGM",
        "Anvelope flota",
        "Consumabile vulcanizare",
        "Retur anvelope",
        "Stoc sezonier anvelope",
      ],
    },
    service: {
      category: "SCOOTER_REPAIRS",
      base: 620,
      descriptions: [
        "Revizii lot flota",
        "Reparatie motor",
        "Diagnoza electrica",
        "Reparatie dupa incident",
        "Montaj anvelope",
        "Interventie urgenta",
        "Inspectie tehnica flota",
        "Pregatire sezon",
        "Corectie factura service",
        "Deviz reparatii viitoare",
      ],
    },
    insuranceA: {
      category: "SCOOTER_INSURANCE",
      base: 510,
      descriptions: [
        "Polite RCA lot flota",
        "Polite CASCO",
        "Reinnoire polite",
        "Supliment scooter nou",
        "Ajustare prima",
        "Administrare dosar dauna",
        "Extindere acoperire",
        "Prima trimestriala",
        "Regularizare polita",
        "Reinnoire anuala",
      ],
    },
    insuranceB: {
      category: "COMPANY_LAWYER",
      base: 190,
      descriptions: [
        "Comision broker RCA",
        "Consultanta asigurare",
        "Administrare reinnoiri",
        "Asistenta dosar dauna",
        "Comparatie oferte",
        "Emiterea suplimentelor",
        "Audit polite flota",
        "Regularizare comision",
        "Servicii broker lunare",
        "Pregatire reinnoire",
      ],
    },
    internet: {
      category: "COMPANY_INTERNET",
      base: 189,
      descriptions: [
        "Abonament internet ianuarie",
        "Abonament internet februarie",
        "Abonament internet martie",
        "Abonament internet aprilie",
        "Abonament internet mai",
        "Abonament internet iunie",
        "Abonament internet iulie",
        "Abonament internet august",
        "IP static business",
        "Echipament retea",
      ],
    },
    landlord: {
      category: "RENT_AND_UTILITIES",
      base: 4200,
      descriptions: [
        "Chirie spatiu ianuarie",
        "Chirie spatiu februarie",
        "Chirie spatiu martie",
        "Chirie spatiu aprilie",
        "Chirie spatiu mai",
        "Chirie spatiu iunie",
        "Chirie spatiu iulie",
        "Chirie spatiu august",
        "Cheltuieli comune spatiu",
        "Regularizare chirie",
      ],
    },
  };

  return (
    Object.keys(COMPANY_SEEDS) as Array<keyof typeof COMPANY_SEEDS>
  ).flatMap((key, companyIndex) => {
    const profile = profiles[key];
    return profile.descriptions.map((description, occurrence) => {
      const amount = (
        profile.base +
        occurrence * (key === "internet" ? 0 : 35)
      ).toFixed(2);
      return seedTransaction(`v2-company-${key}-${occurrence + 1}`, {
        type: MoneyTransactionType.EXPENSE,
        status:
          occurrence === 9 && key === "service"
            ? MoneyTransactionStatus.DRAFT
            : MoneyTransactionStatus.POSTED,
        amount,
        financialScope: MoneyTransactionScope.COMPANY,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        billingStatus: BillingStatus.BILLED,
        categoryId: context.categories[profile.category],
        counterpartyUserId: null,
        counterpartyId: context.companyCounterparties[key],
        recipientUserId: null,
        debtorUserId: null,
        creditorUserId: null,
        recordedByUserId: context.adminA.id,
        occurredAt: historicalDate(
          context.anchor,
          companyIndex * 10 + occurrence,
          70,
        ),
        description,
        originTransactionId: null,
        reversalOfTransactionId: null,
        balanceChanges:
          occurrence === 9 && key === "service"
            ? []
            : [
                {
                  walletId: FINANCE_SEED_IDS.bankWallet,
                  bucket: BalanceBucket.BUSINESS_FUNDS,
                  amountDelta: `-${amount}`,
                },
              ],
        references: [
          {
            referenceType: "company",
            referenceId: COMPANY_SEEDS[key].id,
            isPrimary: true,
          },
        ],
      });
    });
  });
}

function buildOperatingTransactions(context: {
  categories: Record<string, string>;
  anchor: Date;
  adminA: { id: string; walletId: string };
  adminB: { id: string; walletId: string };
}): SeedTransaction[] {
  const rows: SeedTransaction[] = [];
  for (let index = 0; index < 30; index += 1) {
    const amount = (500 + index * 25).toFixed(2);
    rows.push(
      transfer(
        `v2-operating-transfer-${index + 1}`,
        amount,
        index % 2 === 0
          ? FINANCE_SEED_IDS.cashWallet
          : FINANCE_SEED_IDS.processorWallet,
        FINANCE_SEED_IDS.bankWallet,
        index % 2 === 0 ? context.adminA.id : context.adminB.id,
        historicalDate(context.anchor, index, 98),
        index % 2 === 0
          ? "Depunere periodica numerar in banca"
          : "Decontare periodica procesator plati",
      ),
    );
  }
  const expenseCategories = [
    "COMPANY_ACCOUNTING",
    "COMPANY_OFFICE_SUPPLIES",
    "COMPANY_UTILITIES",
    "MARKETING_EXPENSES",
  ] as const;
  for (let index = 0; index < 34; index += 1) {
    const amount = (120 + (index % 5) * 45).toFixed(2);
    rows.push(
      seedTransaction(`v2-operating-expense-${index + 1}`, {
        type: MoneyTransactionType.EXPENSE,
        status: MoneyTransactionStatus.POSTED,
        amount,
        financialScope: MoneyTransactionScope.COMPANY,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        billingStatus: BillingStatus.BILLED,
        categoryId:
          context.categories[
            expenseCategories[index % expenseCategories.length]
          ],
        counterpartyUserId: null,
        recipientUserId: null,
        debtorUserId: null,
        creditorUserId: null,
        recordedByUserId: context.adminA.id,
        occurredAt: historicalDate(context.anchor, 30 + index, 98),
        description: "Cheltuiala operationala recurenta",
        originTransactionId: null,
        reversalOfTransactionId: null,
        balanceChanges: [
          {
            walletId: FINANCE_SEED_IDS.bankWallet,
            bucket: BalanceBucket.BUSINESS_FUNDS,
            amountDelta: `-${amount}`,
          },
        ],
        references: [],
      }),
    );
  }
  for (let index = 0; index < 34; index += 1) {
    const amount = (350 + (index % 6) * 50).toFixed(2);
    rows.push(
      seedTransaction(`v2-operating-income-${index + 1}`, {
        type: MoneyTransactionType.INCOME,
        status: MoneyTransactionStatus.POSTED,
        amount,
        financialScope: MoneyTransactionScope.COMPANY,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        billingStatus: BillingStatus.BILLED,
        categoryId: context.categories.RENTAL_REVENUE,
        counterpartyUserId: null,
        recipientUserId: null,
        debtorUserId: null,
        creditorUserId: null,
        recordedByUserId: context.adminB.id,
        occurredAt:
          index === 33
            ? context.anchor
            : historicalDate(context.anchor, 64 + index, 98),
        description: "Decont centralizat contract inchiriere corporate",
        originTransactionId: null,
        reversalOfTransactionId: null,
        balanceChanges: [
          {
            walletId: FINANCE_SEED_IDS.bankWallet,
            bucket: BalanceBucket.BUSINESS_FUNDS,
            amountDelta: amount,
          },
        ],
        references: [],
      }),
    );
  }
  return rows;
}

function rentalStart(
  anchor: Date,
  person: PersonFinanceSeed,
  index: number,
): Date {
  const proposed = addDays(anchor, -330 + ((index * 2) % 280));
  return person.deletedAt && proposed >= person.deletedAt
    ? addDays(person.deletedAt, -35)
    : proposed;
}

function historicalDate(anchor: Date, index: number, count: number): Date {
  return addDays(anchor, -330 + Math.floor((index * 300) / Math.max(count, 1)));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1_000);
}

function seedTransaction(
  slug: string,
  input: TransactionInput,
): SeedTransaction {
  return {
    id: `seed-finance-tx-${slug}`,
    currency: CURRENCY,
    idempotencyKey: input.idempotencyKey ?? `${FINANCE_SEED_PREFIX}:${slug}`,
    counterpartyId: input.counterpartyId ?? null,
    recipientCounterpartyId: input.recipientCounterpartyId ?? null,
    debtorCounterpartyId: input.debtorCounterpartyId ?? null,
    creditorCounterpartyId: input.creditorCounterpartyId ?? null,
    ...input,
    balanceChanges: (input.balanceChanges ?? []).map((change, index) => ({
      id: `seed-finance-change-${slug}-${index + 1}`,
      ...change,
    })),
    references: (input.references ?? []).map((reference, index) => ({
      id: `seed-finance-reference-${slug}-${index + 1}`,
      ...reference,
    })),
  };
}

function transfer(
  slug: string,
  amount: string,
  sourceWalletId: string,
  destinationWalletId: string,
  recorder: string,
  occurredAt: Date,
  description: string,
): SeedTransaction {
  return seedTransaction(slug, {
    type: MoneyTransactionType.TRANSFER,
    status: MoneyTransactionStatus.POSTED,
    amount,
    financialScope: MoneyTransactionScope.COMPANY,
    paymentMethod: null,
    billingStatus: BillingStatus.NOT_APPLICABLE,
    categoryId: null,
    counterpartyUserId: null,
    recipientUserId: null,
    debtorUserId: null,
    creditorUserId: null,
    recordedByUserId: recorder,
    occurredAt,
    description,
    originTransactionId: null,
    reversalOfTransactionId: null,
    balanceChanges: [
      {
        walletId: sourceWalletId,
        bucket: BalanceBucket.BUSINESS_FUNDS,
        amountDelta: `-${amount}`,
      },
      {
        walletId: destinationWalletId,
        bucket: BalanceBucket.BUSINESS_FUNDS,
        amountDelta: amount,
      },
    ],
    references: [],
  });
}

function customerCashMovement(
  slug: string,
  type:
    | typeof MoneyTransactionType.USER_PAYMENT
    | typeof MoneyTransactionType.REFUND,
  amount: string,
  customer: { id: string; walletId: string },
  companyWalletId: string,
  recorder: string,
  occurredAt: Date,
  description: string,
  amountDelta: string,
  paymentMethod: PaymentMethod = PaymentMethod.CASH,
): SeedTransaction {
  return seedTransaction(slug, {
    type,
    status: MoneyTransactionStatus.POSTED,
    amount,
    financialScope: MoneyTransactionScope.COMPANY,
    paymentMethod,
    billingStatus: BillingStatus.NOT_APPLICABLE,
    categoryId: null,
    counterpartyUserId: customer.id,
    recipientUserId: null,
    debtorUserId: null,
    creditorUserId: null,
    recordedByUserId: recorder,
    occurredAt,
    description,
    originTransactionId: null,
    reversalOfTransactionId: null,
    balanceChanges: [
      {
        walletId: customer.walletId,
        bucket: BalanceBucket.USER_SETTLEMENT,
        amountDelta,
      },
      {
        walletId: companyWalletId,
        bucket: BalanceBucket.BUSINESS_FUNDS,
        amountDelta,
      },
    ],
    references: [],
  });
}

function guaranteeMovement(
  slug: string,
  type:
    | typeof MoneyTransactionType.GUARANTEE_RECEIVED
    | typeof MoneyTransactionType.GUARANTEE_REFUNDED,
  amount: string,
  customer: { id: string; walletId: string },
  companyWalletId: string,
  recorder: string,
  occurredAt: Date,
  description: string,
  amountDelta: string,
): SeedTransaction {
  return seedTransaction(slug, {
    type,
    status: MoneyTransactionStatus.POSTED,
    amount,
    financialScope: MoneyTransactionScope.CUSTOMER_HELD,
    paymentMethod: PaymentMethod.CASH,
    billingStatus: BillingStatus.NOT_APPLICABLE,
    categoryId: null,
    counterpartyUserId: customer.id,
    recipientUserId: null,
    debtorUserId: null,
    creditorUserId: null,
    recordedByUserId: recorder,
    occurredAt,
    description,
    originTransactionId: null,
    reversalOfTransactionId: null,
    balanceChanges: [
      {
        walletId: customer.walletId,
        bucket: BalanceBucket.USER_SETTLEMENT,
        amountDelta,
      },
      {
        walletId: companyWalletId,
        bucket: BalanceBucket.CUSTOMER_GUARANTEE_FUNDS,
        amountDelta,
      },
    ],
    references: [],
  });
}

function personAndScooterReferences(
  personId: string,
  scooterId: string,
): Array<Omit<SeedReference, "id">> {
  return [
    { referenceType: "PERSON", referenceId: personId, isPrimary: true },
    { referenceType: "SCOOTER", referenceId: scooterId, isPrimary: false },
  ];
}

function currentPeriodDate(anchor: Date, position: number): Date {
  const start = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1);
  const span = Math.max(anchor.getTime() - start, 0);
  return new Date(start + Math.round(span * position));
}

function previousPeriodDate(anchor: Date, position: number): Date {
  const end = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1);
  const start = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 1);
  return new Date(start + Math.round((end - start) * position));
}

function validateManifest(
  transactions: readonly SeedTransaction[],
  people: readonly PersonFinanceSeed[],
): void {
  if (transactions.length !== 1_000) {
    throw new Error(
      `Finance v2 must contain exactly 1000 transactions; received ${transactions.length}.`,
    );
  }
  assertUnique(
    transactions.map((row) => row.id),
    "transaction ID",
  );

  for (const person of people) {
    const linked = transactions.filter(
      (row) => row.counterpartyId === person.counterpartyId,
    );
    if (linked.length < 5) {
      throw new Error(
        `Finance person ${person.personId} has only ${linked.length} linked transactions.`,
      );
    }
  }

  for (const company of Object.values(COMPANY_SEEDS)) {
    const linked = transactions.filter(
      (row) => row.counterpartyId === company.counterpartyId,
    );
    if (linked.length < 5) {
      throw new Error(
        `Finance company ${company.id} has only ${linked.length} linked transactions.`,
      );
    }
  }

  const weeklyRentals = transactions.filter(
    (row) =>
      row.type === MoneyTransactionType.USER_CHARGE &&
      row.description?.includes("inchiriere saptamanala"),
  );
  if (weeklyRentals.length === 0) {
    throw new Error("Finance v2 must contain weekly scooter rentals.");
  }
  for (const rental of weeklyRentals) {
    if (rental.amount !== "250.00" && rental.amount !== "300.00") {
      throw new Error(`${rental.id} must cost 250 or 300 RON per week.`);
    }
    const referenceTypes = new Set(
      rental.references.map(({ referenceType }) => referenceType),
    );
    if (!referenceTypes.has("PERSON") || !referenceTypes.has("SCOOTER")) {
      throw new Error(`${rental.id} must reference a person and scooter.`);
    }
  }
  const standardRateShare =
    weeklyRentals.filter((row) => row.amount === "300.00").length /
    weeklyRentals.length;
  if (standardRateShare < 0.8) {
    throw new Error("At least 80% of weekly rentals must cost 300 RON.");
  }

  const guarantees = transactions.filter(
    (row) =>
      row.type === MoneyTransactionType.GUARANTEE_RECEIVED ||
      row.type === MoneyTransactionType.GUARANTEE_REFUNDED,
  );
  if (guarantees.some((row) => row.amount !== "200.00")) {
    throw new Error("Every rental guarantee must be exactly 200 RON.");
  }
  if (
    !transactions.some((row) =>
      row.description?.startsWith("Penalitate predare cu intarziere"),
    )
  ) {
    throw new Error("Finance v2 must contain late-return penalties.");
  }
  assertUnique(
    transactions.map((row) => row.idempotencyKey),
    "idempotency key",
  );
  assertUnique(
    transactions.flatMap((row) =>
      row.balanceChanges.map((change) => change.id),
    ),
    "balance-change ID",
  );
  assertUnique(
    transactions.flatMap((row) =>
      row.references.map((reference) => reference.id),
    ),
    "reference ID",
  );

  for (const transaction of transactions) {
    const amount = new Prisma.Decimal(transaction.amount);
    if (!amount.greaterThan(0)) {
      throw new Error(`${transaction.id} must have a positive amount.`);
    }
    if (!/^[A-Z]{3}$/.test(transaction.currency)) {
      throw new Error(`${transaction.id} has an invalid currency.`);
    }
    if (
      transaction.status === MoneyTransactionStatus.DRAFT &&
      transaction.balanceChanges.length > 0
    ) {
      throw new Error(
        `${transaction.id} is a draft and cannot affect balances.`,
      );
    }
    for (const change of transaction.balanceChanges) {
      const delta = new Prisma.Decimal(change.amountDelta);
      if (delta.isZero() || !delta.abs().equals(amount)) {
        throw new Error(`${change.id} must equal the transaction amount.`);
      }
    }
  }
}

function validateOperatingCompanyActivity(
  transactions: readonly SeedTransaction[],
): { incomeCount: number; expenseCount: number } {
  const operatingActivity = transactions.filter(
    (transaction) =>
      transaction.financialScope === MoneyTransactionScope.COMPANY &&
      (transaction.type === MoneyTransactionType.INCOME ||
        transaction.type === MoneyTransactionType.EXPENSE),
  );
  const companyWalletIds = new Set(COMPANY_WALLETS.map(({ id }) => id));
  const unassignedPosted = operatingActivity.filter(
    (transaction) =>
      transaction.status === MoneyTransactionStatus.POSTED &&
      !transaction.balanceChanges.some(({ walletId }) =>
        companyWalletIds.has(walletId),
      ),
  );
  if (unassignedPosted.length > 0) {
    throw new Error(
      `JUSEM HUB SRL has ${unassignedPosted.length} posted income or expense transactions without an assigned company wallet.`,
    );
  }

  const incomeCount = operatingActivity.filter(
    ({ type }) => type === MoneyTransactionType.INCOME,
  ).length;
  const expenseCount = operatingActivity.filter(
    ({ type }) => type === MoneyTransactionType.EXPENSE,
  ).length;
  if (incomeCount === 0 || expenseCount === 0) {
    throw new Error(
      "JUSEM HUB SRL must have seeded company income and expense activity.",
    );
  }
  return { incomeCount, expenseCount };
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value))
      throw new Error(`Duplicate finance seed ${label}: ${value}`);
    seen.add(value);
  }
}

async function ensureSeedTransaction(
  tx: Prisma.TransactionClient,
  seed: SeedTransaction,
): Promise<void> {
  const existing = await tx.moneyTransaction.findFirst({
    where: { OR: [{ id: seed.id }, { idempotencyKey: seed.idempotencyKey }] },
    include: { balanceChanges: true, references: true },
  });

  if (existing) {
    const actual = JSON.stringify({
      id: existing.id,
      type: existing.type,
      status: existing.status,
      amount: existing.amount.toFixed(2),
      currency: existing.currency,
      financialScope: existing.financialScope,
      paymentMethod: existing.paymentMethod,
      billingStatus: existing.billingStatus,
      categoryId: existing.categoryId,
      counterpartyUserId: existing.counterpartyUserId,
      counterpartyId: existing.counterpartyId,
      recipientUserId: existing.recipientUserId,
      recipientCounterpartyId: existing.recipientCounterpartyId,
      debtorUserId: existing.debtorUserId,
      debtorCounterpartyId: existing.debtorCounterpartyId,
      creditorUserId: existing.creditorUserId,
      creditorCounterpartyId: existing.creditorCounterpartyId,
      recordedByUserId: existing.recordedByUserId,
      occurredAt: existing.occurredAt.toISOString(),
      description: existing.description,
      idempotencyKey: existing.idempotencyKey,
      originTransactionId: existing.originTransactionId,
      reversalOfTransactionId: existing.reversalOfTransactionId,
      balanceChanges: existing.balanceChanges
        .map((change) => ({
          id: change.id,
          walletId: change.walletId,
          bucket: change.bucket,
          amountDelta: change.amountDelta.toFixed(2),
        }))
        .sort(byId),
      references: existing.references
        .map((reference) => ({
          id: reference.id,
          referenceType: reference.referenceType,
          referenceId: reference.referenceId,
          isPrimary: reference.isPrimary,
        }))
        .sort(byId),
    });
    const expected = JSON.stringify(transactionFingerprint(seed));
    if (actual !== expected) {
      throw new Error(
        `Immutable finance seed transaction ${seed.id} differs from ${FINANCE_SEED_VERSION}; use a clean database or introduce a fully versioned fixture.`,
      );
    }
    return;
  }

  await tx.moneyTransaction.create({
    data: {
      id: seed.id,
      type: seed.type,
      status: seed.status,
      amount: new Prisma.Decimal(seed.amount),
      currency: seed.currency,
      financialScope: seed.financialScope,
      paymentMethod: seed.paymentMethod,
      billingStatus: seed.billingStatus,
      categoryId: seed.categoryId,
      counterpartyUserId: seed.counterpartyUserId,
      counterpartyId: seed.counterpartyId,
      recipientUserId: seed.recipientUserId,
      recipientCounterpartyId: seed.recipientCounterpartyId,
      debtorUserId: seed.debtorUserId,
      debtorCounterpartyId: seed.debtorCounterpartyId,
      creditorUserId: seed.creditorUserId,
      creditorCounterpartyId: seed.creditorCounterpartyId,
      recordedByUserId: seed.recordedByUserId,
      occurredAt: seed.occurredAt,
      description: seed.description,
      idempotencyKey: seed.idempotencyKey,
      originTransactionId: seed.originTransactionId,
      reversalOfTransactionId: seed.reversalOfTransactionId,
      createdAt: seed.occurredAt,
      balanceChanges: {
        create: seed.balanceChanges.map((change) => ({
          id: change.id,
          walletId: change.walletId,
          bucket: change.bucket,
          currency: seed.currency,
          amountDelta: new Prisma.Decimal(change.amountDelta),
          createdAt: seed.occurredAt,
        })),
      },
      references: {
        create: seed.references.map((reference) => ({
          id: reference.id,
          referenceType: reference.referenceType,
          referenceId: reference.referenceId,
          isPrimary: reference.isPrimary,
          createdAt: seed.occurredAt,
        })),
      },
    },
  });
}

function transactionFingerprint(seed: SeedTransaction) {
  return {
    id: seed.id,
    type: seed.type,
    status: seed.status,
    amount: new Prisma.Decimal(seed.amount).toFixed(2),
    currency: seed.currency,
    financialScope: seed.financialScope,
    paymentMethod: seed.paymentMethod,
    billingStatus: seed.billingStatus,
    categoryId: seed.categoryId,
    counterpartyUserId: seed.counterpartyUserId,
    counterpartyId: seed.counterpartyId,
    recipientUserId: seed.recipientUserId,
    recipientCounterpartyId: seed.recipientCounterpartyId,
    debtorUserId: seed.debtorUserId,
    debtorCounterpartyId: seed.debtorCounterpartyId,
    creditorUserId: seed.creditorUserId,
    creditorCounterpartyId: seed.creditorCounterpartyId,
    recordedByUserId: seed.recordedByUserId,
    occurredAt: seed.occurredAt.toISOString(),
    description: seed.description,
    idempotencyKey: seed.idempotencyKey,
    originTransactionId: seed.originTransactionId,
    reversalOfTransactionId: seed.reversalOfTransactionId,
    balanceChanges: [...seed.balanceChanges].sort(byId),
    references: [...seed.references].sort(byId),
  };
}

function byId<T extends { id: string }>(first: T, second: T): number {
  return first.id.localeCompare(second.id);
}

async function replayAffectedBalances(
  tx: Prisma.TransactionClient,
  transactions: readonly SeedTransaction[],
): Promise<void> {
  const keys = new Map<
    string,
    { walletId: string; bucket: WalletBalanceBucket; currency: string }
  >();
  for (const transaction of transactions) {
    for (const change of transaction.balanceChanges) {
      const key = `${change.walletId}:${change.bucket}:${transaction.currency}`;
      keys.set(key, {
        walletId: change.walletId,
        bucket: change.bucket,
        currency: transaction.currency,
      });
    }
  }

  for (const key of keys.values()) {
    const aggregate = await tx.walletBalanceChange.aggregate({
      where: {
        walletId: key.walletId,
        bucket: key.bucket,
        currency: key.currency,
        moneyTransaction: {
          status: {
            in: [
              MoneyTransactionStatus.POSTED,
              MoneyTransactionStatus.REVERSED,
            ],
          },
        },
      },
      _sum: { amountDelta: true },
    });
    const balance = aggregate._sum.amountDelta ?? new Prisma.Decimal(0);
    const row = await tx.walletBalance.upsert({
      where: {
        walletId_bucket_currency: {
          walletId: key.walletId,
          bucket: key.bucket,
          currency: key.currency,
        },
      },
      create: { ...key, balance },
      update: { balance },
      select: { balance: true },
    });
    if (!row.balance.equals(balance)) {
      throw new Error(`Finance balance replay failed for ${key.walletId}.`);
    }
  }
}

async function seedTransactionAudits(
  tx: Prisma.TransactionClient,
  transactions: readonly SeedTransaction[],
): Promise<void> {
  const claim = transactions.find(
    (row) => row.type === MoneyTransactionType.PERSONAL_FUNDS_CLAIM,
  );
  const reversal = transactions.find(
    (row) => row.type === MoneyTransactionType.REVERSAL,
  );
  for (const transaction of transactions) {
    if (transaction.type === MoneyTransactionType.PERSONAL_FUNDS_CLAIM) {
      continue;
    }
    const meta = {
      transactionType: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      financialScope: transaction.financialScope,
    };
    await ensureAuditEvent(tx, {
      id: `seed-audit-${transaction.id}-created`,
      userId: transaction.recordedByUserId,
      type: "MONEY_TRANSACTION_CREATED",
      targetType: "moneyTransaction",
      targetId: transaction.id,
      createdAt: transaction.occurredAt,
      meta,
    });
    if (transaction.status !== MoneyTransactionStatus.DRAFT) {
      await ensureAuditEvent(tx, {
        id: `seed-audit-${transaction.id}-posted`,
        userId: transaction.recordedByUserId,
        type: "MONEY_TRANSACTION_POSTED",
        targetType: "moneyTransaction",
        targetId: transaction.id,
        createdAt: transaction.occurredAt,
        meta:
          transaction.type === MoneyTransactionType.INCOME &&
          transaction.financialScope === MoneyTransactionScope.ADMIN_PERSONAL
            ? { ...meta, generatedClaimIds: claim ? [claim.id] : [] }
            : meta,
      });
    }
    if (transaction.status === MoneyTransactionStatus.REVERSED) {
      await ensureAuditEvent(tx, {
        id: `seed-audit-${transaction.id}-reversed`,
        userId: transaction.recordedByUserId,
        type: "MONEY_TRANSACTION_REVERSED",
        targetType: "moneyTransaction",
        targetId: transaction.id,
        createdAt: reversal?.occurredAt ?? transaction.occurredAt,
        meta: { ...meta, reversalTransactionId: reversal?.id ?? null },
      });
    }
  }
}

async function ensureAuditEvent(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    userId: string;
    type: string;
    targetType: string;
    targetId: string;
    createdAt: Date;
    meta: Prisma.InputJsonObject;
  },
): Promise<void> {
  await tx.auditEvent.upsert({
    where: { id: input.id },
    create: {
      ...input,
      ip: null,
      userAgent: null,
    },
    update: {
      ...input,
      ip: null,
      userAgent: null,
    },
  });
}

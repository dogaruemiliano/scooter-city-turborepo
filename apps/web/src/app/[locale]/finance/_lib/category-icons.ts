import { v1 } from "@repo/api-shared";
import {
  AlertTriangleIcon,
  BanknoteIcon,
  BikeIcon,
  Building2Icon,
  CarIcon,
  CreditCardIcon,
  FileTextIcon,
  FuelIcon,
  GiftIcon,
  GraduationCapIcon,
  HeartIcon,
  HomeIcon,
  MegaphoneIcon,
  PackageIcon,
  PhoneIcon,
  PiggyBankIcon,
  ReceiptIcon,
  ScaleIcon,
  ShieldIcon,
  TagIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
  WifiIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";

/** Curated Lucide icon names selectable for a financial category. */
export const CATEGORY_ICON_NAMES = v1.finance.FINANCIAL_CATEGORY_ICONS;

/** Maps a stored Lucide icon name to its component, kept in sync with `CATEGORY_ICON_NAMES`. */
export const CATEGORY_ICON_COMPONENTS: Record<
  v1.finance.FinancialCategoryIcon,
  LucideIcon
> = {
  wrench: WrenchIcon,
  truck: TruckIcon,
  fuel: FuelIcon,
  shield: ShieldIcon,
  receipt: ReceiptIcon,
  wallet: WalletIcon,
  bike: BikeIcon,
  zap: ZapIcon,
  tag: TagIcon,
  "building-2": Building2Icon,
  users: UsersIcon,
  banknote: BanknoteIcon,
  car: CarIcon,
  package: PackageIcon,
  phone: PhoneIcon,
  wifi: WifiIcon,
  home: HomeIcon,
  heart: HeartIcon,
  gift: GiftIcon,
  megaphone: MegaphoneIcon,
  "credit-card": CreditCardIcon,
  "piggy-bank": PiggyBankIcon,
  "alert-triangle": AlertTriangleIcon,
  scale: ScaleIcon,
  "graduation-cap": GraduationCapIcon,
  "file-text": FileTextIcon,
};

function isCategoryIconName(
  value: string,
): value is v1.finance.FinancialCategoryIcon {
  return (CATEGORY_ICON_NAMES as readonly string[]).includes(value);
}

/** Resolves a stored icon name to its component, or `undefined` when unset or unknown. */
export function categoryIconComponent(
  icon: string | null | undefined,
): LucideIcon | undefined {
  if (!icon || !isCategoryIconName(icon)) return undefined;
  return CATEGORY_ICON_COMPONENTS[icon];
}

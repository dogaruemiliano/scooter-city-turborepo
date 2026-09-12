// County abbreviations: ANAF's published "Codificare auto judete" table:
// https://static.anaf.ro/static/10/Anaf/Declaratii_R/AplicatiiDec/structura_F4102_17052024.pdf
export const ROMANIAN_COUNTY_NAMES = {
  AB: "Alba",
  AR: "Arad",
  AG: "Argeș",
  BC: "Bacău",
  BH: "Bihor",
  BN: "Bistrița-Năsăud",
  BT: "Botoșani",
  BV: "Brașov",
  BR: "Brăila",
  B: "București",
  BZ: "Buzău",
  CS: "Caraș-Severin",
  CL: "Călărași",
  CJ: "Cluj",
  CT: "Constanța",
  CV: "Covasna",
  DB: "Dâmbovița",
  DJ: "Dolj",
  GL: "Galați",
  GR: "Giurgiu",
  GJ: "Gorj",
  HR: "Harghita",
  HD: "Hunedoara",
  IL: "Ialomița",
  IS: "Iași",
  IF: "Ilfov",
  MM: "Maramureș",
  MH: "Mehedinți",
  MS: "Mureș",
  NT: "Neamț",
  OT: "Olt",
  PH: "Prahova",
  SM: "Satu Mare",
  SJ: "Sălaj",
  SB: "Sibiu",
  SV: "Suceava",
  TR: "Teleorman",
  TM: "Timiș",
  TL: "Tulcea",
  VS: "Vaslui",
  VL: "Vâlcea",
  VN: "Vrancea",
} as const;

export const ROMANIAN_COUNTIES = Object.values(ROMANIAN_COUNTY_NAMES);

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function countyName(value: string): string | undefined {
  const name = normalized(value)
    .replace(/^(?:municipiul|mun\.)\s*/u, "")
    .replace(/[\s.-]/gu, "");
  return Object.entries(ROMANIAN_COUNTY_NAMES).find(
    ([code, county]) =>
      normalized(code) === name ||
      normalized(county).replace(/[\s-]/gu, "") === name,
  )?.[1];
}

// Require a label boundary: e.g. "Mun.Râmnicu Vâlcea", but not "Satu Mare".
// Street/building markers end a locality, so they never become part of its name.
const labels =
  /(?<![\p{L}\d])(județul|judeţul|judetul|județ|judeţ|judet|jud|municipiul|municipiu|mun|orașul|oraşul|orasul|oraș|oraş|oras|or|comuna|com|satul|sat|localitatea|loc|bulevardul|b-dul|bdul|bd|șoseaua|şoseaua|soseaua|șos|sos|aleea|intrarea|intr|strada|str|numărul|numarul|nr|bloc|bl|scara|sc|apartament|ap|sectorul|sector)(?:\.\s*|:\s*|\s+)/giu;

export function parseRomanianAddress(value: string): {
  region?: string;
  city?: string;
} {
  const matches = [...value.matchAll(labels)];
  const result: { region?: string; city?: string } = {};
  let cityPriority = 0;
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!;
    const label = normalized(match[1]!);
    const part = value
      .slice(match.index + match[0].length, matches[index + 1]?.index)
      .split(/[,;/\n]/u)[0]!
      .trim()
      .replace(/[.,;]+$/u, "")
      .trim();
    if (!part) continue;
    if (label.startsWith("jud")) {
      result.region = countyName(part);
      continue;
    }
    // When a village and its commune are both printed, the village is the
    // locality. Keep the complete original address in addressLine1.
    const priority = label.startsWith("sat")
      ? 3
      : /^(?:mun|or|loc)/u.test(label)
        ? 2
        : label.startsWith("com")
          ? 1
          : 0;
    if (priority > cityPriority && /\p{L}/u.test(part)) {
      result.city = part;
      cityPriority = priority;
    }
  }
  result.region ??= countyName(
    matches.length ? value.slice(0, matches[0]!.index).trim() : value,
  );
  if (
    !result.region &&
    result.city &&
    countyName(result.city) === "București"
  ) {
    result.region = "București";
  }
  return result;
}

export function normalizeRomanianCounty(value: string): string {
  return parseRomanianAddress(value).region ?? value;
}

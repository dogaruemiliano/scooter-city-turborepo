import administrativeAreas from "@repo/api-shared/romania-administrative-areas.json";

export const ROMANIAN_COUNTY_NAMES: Readonly<Record<string, string>> =
  Object.fromEntries(
    administrativeAreas.map((county) => [county.code, county.name]),
  );
export const ROMANIAN_COUNTIES = administrativeAreas.map(
  (county) => county.name,
);

export interface RomanianLocality {
  name: string;
  sirutaCode: number;
}

const localitiesByCounty = new Map(
  administrativeAreas.map((county) => [
    county.name,
    [...county.cities, ...county.communes].sort((a, b) =>
      a.name.localeCompare(b.name, "ro"),
    ),
  ]),
);

export function getRomanianLocalities(
  county: string,
): readonly RomanianLocality[] {
  return localitiesByCounty.get(countyName(county) ?? "") ?? [];
}

export function matchRomanianLocality(
  county: string,
  value: string,
): string | undefined {
  const name = normalized(value)
    .replace(
      /^(?:municipiul|municipiu|mun|orasul|oras|or|comuna|com|localitatea|loc)(?:\.\s*|\s+)/u,
      "",
    )
    .replace(/[\s.-]/gu, "");
  const matches = getRomanianLocalities(county).filter(
    (locality) => normalized(locality.name).replace(/[\s.-]/gu, "") === name,
  );
  return matches.length === 1 ? matches[0]!.name : undefined;
}

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
  /(?<![\p{L}\d])(județul|judeţul|judetul|județ|judeţ|judet|jud|municipiul|municipiu|mun|orașul|oraşul|orasul|oraș|oraş|oras|or|comuna|com|satul|sat|localitatea|loc|bulevardul|b-dul|bdul|bd|șoseaua|şoseaua|soseaua|șos|sos|aleea|intrarea|intr|strada|str|numărul|numarul|nr|bloc|bl|scara|sc|apartament|apartment|apt|ap|etajul|etaj|et|corp|camera|cam|sectorul|sector)(?:\.\s*|:\s*|\s+)/giu;

export function parseRomanianAddress(
  value: string,
  countyHint?: string,
): {
  region?: string;
  city?: string;
} {
  const matches = [...value.matchAll(labels)];
  const result: { region?: string; city?: string } = {};
  const candidates: string[] = [];
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
    // This dataset contains cities and communes, not villages. A printed
    // village stays in the full address and must not imply its parent commune.
    if (/^(?:mun|or|com|loc)/u.test(label) && /\p{L}/u.test(part))
      candidates.push(part);
  }
  result.region ??= countyName(
    matches.length ? value.slice(0, matches[0]!.index).trim() : value,
  );
  if (
    !result.region &&
    candidates.some((candidate) => countyName(candidate) === "București")
  ) {
    result.region = "București";
  }
  const county = result.region ?? countyHint;
  if (county) {
    const matches = [
      ...new Set(
        candidates
          .map((candidate) => matchRomanianLocality(county, candidate))
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    if (matches.length === 1) result.city = matches[0];
  }
  return result;
}

export function normalizeRomanianCounty(value: string): string {
  return parseRomanianAddress(value).region ?? value;
}

/** Keep administrative labels out of street lines and move premises/village details to line 2. */
export function splitRomanianAddressLines(
  value: string,
  sourceLine: 1 | 2 = 1,
): {
  addressLine1?: string;
  addressLine2?: string;
} {
  const matches = [...value.matchAll(labels)];
  const street: string[] = [];
  const extra: string[] = [];
  const clean = (text: string) =>
    text
      .trim()
      .replace(/^[,;\s]+|[,;\s]+$/gu, "")
      .replace(/\s+/gu, " ");
  if (!matches.length) {
    const [first, ...rest] = value
      .split(/[,;\n]/u)
      .map(clean)
      .filter(Boolean);
    if (sourceLine === 1 && first) street.push(first);
    else if (first) extra.push(first);
    extra.push(...rest);
  } else {
    const prefix = clean(value.slice(0, matches[0]!.index));
    // A bare street name followed by nr./building metadata is also common.
    if (
      prefix &&
      !/^(?:jud|mun|com|sat|or|loc|str|bd|bul|sos|intr|ale)/u.test(
        normalized(matches[0]![1]!),
      )
    ) {
      (sourceLine === 1 ? street : extra).push(prefix);
    }
    matches.forEach((match, index) => {
      const label = normalized(match[1]!);
      const part = clean(
        value.slice(match.index + match[0].length, matches[index + 1]?.index),
      );
      if (!part) return;
      if (/^(?:jud|mun|com|or|loc)/u.test(label)) return;
      const segment = `${match[1]}${match[0].includes(".") ? "." : ""} ${part}`;
      if (
        /^(?:str|bulevard|b-dul|bdul|bd|sosea|sos|alee|intra|intr|numar|nr)/u.test(
          label,
        )
      ) {
        // nr. without a street is not a street address on its own.
        if (!/^(?:numar|nr)/u.test(label) || street.length) {
          const [main, ...details] = segment
            .split(/[,;\n]/u)
            .map(clean)
            .filter(Boolean);
          if (main) street.push(main);
          extra.push(...details);
        } else extra.push(segment);
      } else extra.push(segment);
    });
  }
  return {
    ...(street.length ? { addressLine1: street.join(", ") } : {}),
    ...(extra.length ? { addressLine2: extra.join(", ") } : {}),
  };
}

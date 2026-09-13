import { readFile, writeFile } from 'node:fs/promises';

interface SirutaRow {
  SIRUTA: string;
  DENLOC: string;
  CODP: string;
  JUD: string;
  SIRSUP: string;
  TIP: string;
  NIV: string;
  MED: string;
  REGIUNE: string;
  FSJ: string;
  FSL: string;
  NUTS: string;
}

interface AdministrativeUnit {
  name: string;
  sirutaCode: number;
}

interface County {
  name: string;
  code: string;
  cities: AdministrativeUnit[];
  communes: AdministrativeUnit[];
  sectors?: AdministrativeUnit[];
}

const SOURCE_URL =
  'https://conexipedia.com/resurse/descarca/siruta-s1-2025.csv';

const COUNTY_CODES: Record<string, string> = {
  Alba: 'AB',
  Arad: 'AR',
  Argeș: 'AG',
  Bacău: 'BC',
  Bihor: 'BH',
  'Bistrița-Năsăud': 'BN',
  Botoșani: 'BT',
  Brașov: 'BV',
  Brăila: 'BR',
  Buzău: 'BZ',
  'Caraș-Severin': 'CS',
  Călărași: 'CL',
  Cluj: 'CJ',
  Constanța: 'CT',
  Covasna: 'CV',
  Dâmbovița: 'DB',
  Dolj: 'DJ',
  Galați: 'GL',
  Giurgiu: 'GR',
  Gorj: 'GJ',
  Harghita: 'HR',
  Hunedoara: 'HD',
  Ialomița: 'IL',
  Iași: 'IS',
  Ilfov: 'IF',
  Maramureș: 'MM',
  Mehedinți: 'MH',
  Mureș: 'MS',
  Neamț: 'NT',
  Olt: 'OT',
  Prahova: 'PH',
  'Satu Mare': 'SM',
  Sălaj: 'SJ',
  Sibiu: 'SB',
  Suceava: 'SV',
  Teleorman: 'TR',
  Timiș: 'TM',
  Tulcea: 'TL',
  Vaslui: 'VS',
  Vâlcea: 'VL',
  Vrancea: 'VN',
  București: 'B',
};

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }

      continue;
    }

    if (char === ',' && !quoted) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);

  return values.map((value) => value.trim());
};

const normalizeCountyName = (value: string): string =>
  value
    .replace(/^JUDEȚUL\s+/iu, '')
    .replace(/^JUDETUL\s+/iu, '')
    .replace(/^MUNICIPIUL\s+BUCUREȘTI$/iu, 'București')
    .replace(/^MUNICIPIUL\s+BUCURESTI$/iu, 'București')
    .trim()
    .toLocaleLowerCase('ro-RO')
    .replace(/(^|[\s-])\p{L}/gu, (match) =>
      match.toLocaleUpperCase('ro-RO'),
    );

const normalizeUatName = (value: string): string =>
  value
    .replace(/^MUNICIPIUL\s+/iu, '')
    .replace(/^ORAȘ(?:UL)?\s+/iu, '')
    .replace(/^ORAS(?:UL)?\s+/iu, '')
    .trim()
    .toLocaleLowerCase('ro-RO')
    .replace(/(^|[\s-])\p{L}/gu, (match) =>
      match.toLocaleUpperCase('ro-RO'),
    );

// Optional local CSV allows regeneration from an archived download.
const csvPath = process.argv[2];
const source = csvPath
  ? await readFile(csvPath, 'utf8')
  : await (async () => {
      const response = await fetch(SOURCE_URL);
      if (!response.ok) {
        throw new Error(`Failed to download SIRUTA CSV: ${response.status} ${response.statusText}`);
      }
      return response.text();
    })();
// The source uses legacy cedilla letters; normalize to Romanian comma-below.
const csv = source.replace(/^\uFEFF/, '').replace(/[ŞşŢţ]/g, (char) =>
  ({ Ş: 'Ș', ş: 'ș', Ţ: 'Ț', ţ: 'ț' })[char]!,
);
const lines = csv.split(/\r?\n/).filter(Boolean);

const headers = parseCsvLine(lines[0]);

const rows: SirutaRow[] = lines.slice(1).map((line) => {
  const values = parseCsvLine(line);

  return Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? '']),
  ) as unknown as SirutaRow;
});

const countyRows = rows.filter((row) => Number(row.NIV) === 1);

const result: County[] = countyRows
  .map((countyRow) => {
    const name = normalizeCountyName(countyRow.DENLOC);
    const countyId = countyRow.JUD;

    const level2 = rows.filter(
      (row) => row.JUD === countyId && Number(row.NIV) === 2,
    );

    const cities = level2
      .filter((row) => [1, 2, 4, 5, 9].includes(Number(row.TIP)))
      .map((row) => ({
        name: normalizeUatName(row.DENLOC),
        sirutaCode: Number(row.SIRUTA),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ro'));

    const communes = level2
      .filter((row) => Number(row.TIP) === 3)
      .map((row) => ({
        name: normalizeUatName(row.DENLOC),
        sirutaCode: Number(row.SIRUTA),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ro'));

    const sectors = rows
      .filter((row) => row.JUD === countyId && Number(row.TIP) === 6)
      .map((row) => ({
        name: normalizeUatName(row.DENLOC),
        sirutaCode: Number(row.SIRUTA),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ro'));

    return {
      name,
      code: COUNTY_CODES[name] ?? '',
      cities,
      communes,
      ...(sectors.length > 0 ? { sectors } : {}),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'ro'));

if (result.length !== 42 || result.some((county) => !county.code)) {
  throw new Error('Expected 42 counties including București, all with county codes');
}

await writeFile(
  new URL('../data/romania-administrative-areas.json', import.meta.url),
  JSON.stringify(result, null, 2),
  'utf8',
);

const cityCount = result.reduce(
  (sum, county) => sum + county.cities.length,
  0,
);

const communeCount = result.reduce(
  (sum, county) => sum + county.communes.length,
  0,
);

const sectorCount = result.reduce(
  (sum, county) => sum + (county.sectors?.length ?? 0),
  0,
);

console.log({
  counties: result.length,
  cities: cityCount,
  communes: communeCount,
  sectors: sectorCount,
  totalUats: cityCount + communeCount + sectorCount,
});

console.log('Generated romania-administrative-areas.json');

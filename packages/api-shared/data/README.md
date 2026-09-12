# Romania administrative areas

`romania-administrative-areas.json` contains 42 county-level entries (including
București), 319 cities, 2,862 communes, and six București sectors. Villages are
not included. Sectors are subdivisions, so they are additional to the 3,181 UATs.

Import from any app:

```ts
import areas from "@repo/api-shared/romania-administrative-areas.json";
```

Native Node ESM requires `with { type: 'json' }` on the import.

Source: INS SIRUTA S1 2025, mirrored by
[Conexipedia](https://conexipedia.com/resurse/localitati-romania), downloaded
2026-09-12. Official dataset: https://data.gov.ro/dataset/siruta-2025.
Names are title-cased and legacy Romanian cedillas normalized to comma-below.
The generator accounts for București's TIP 9 entry at level 2 and its TIP 6
sectors at level 3.

Regenerate from the source URL:

```sh
pnpm --filter @repo/api-shared generate:romania
```

Or supply an archived CSV:

```sh
pnpm --filter @repo/api-shared generate:romania /absolute/path/to/siruta.csv
```

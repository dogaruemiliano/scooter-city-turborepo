import Fuse, { type IFuseOptions } from "fuse.js";

export interface FuzzySearchKey<TItem> {
  name: string;
  weight?: number;
  get: (item: TItem) => string | readonly string[] | undefined;
}

export interface FuzzySearchOptions<TItem> {
  /**
   * Fields to match against. Every key is searched; `weight` biases ranking
   * (a display name should outrank an alias).
   */
  keys: readonly FuzzySearchKey<TItem>[];
  /**
   * How loose a match may be. `0` demands an exact match, `1` matches
   * anything. The default tolerates a typo or two without pulling in the
   * whole list.
   */
  threshold?: number;
  limit?: number;
}

export type FuzzyIndex<TItem> = Fuse<TItem>;

const DEFAULT_THRESHOLD = 0.35;

/**
 * Builds the searchable index once so repeated queries over the same list
 * don't re-tokenize it — memoize this on `items` and hand the result to
 * {@link searchFuzzyIndex}.
 */
export function createFuzzyIndex<TItem>(
  items: readonly TItem[],
  { keys, threshold = DEFAULT_THRESHOLD }: FuzzySearchOptions<TItem>,
): FuzzyIndex<TItem> {
  const fuseOptions: IFuseOptions<TItem> = {
    keys: keys.map((key) => ({
      name: key.name,
      weight: key.weight,
      getFn: key.get,
    })),
    threshold,
    // Indexed labels are short and a match can start anywhere in them, so
    // position-based scoring only adds noise.
    ignoreLocation: true,
    // "Romania" has to find "România".
    ignoreDiacritics: true,
    minMatchCharLength: 1,
  };

  return new Fuse(items, fuseOptions);
}

/**
 * Ranks the indexed items against `query`, tolerating typos ("Rmania") and
 * missing diacritics. Returns `fallback` untouched for a blank query so
 * callers keep their own ordering until a search starts.
 */
export function searchFuzzyIndex<TItem>(
  index: FuzzyIndex<TItem>,
  query: string,
  fallback: readonly TItem[],
  limit?: number,
): TItem[] {
  const trimmed = query.trim();

  if (!trimmed) {
    return [...fallback];
  }

  return index
    .search(trimmed, limit ? { limit } : undefined)
    .map((result) => result.item);
}

/** One-shot {@link createFuzzyIndex} + {@link searchFuzzyIndex}. */
export function fuzzySearch<TItem>(
  items: readonly TItem[],
  query: string,
  options: FuzzySearchOptions<TItem>,
): TItem[] {
  if (!query.trim()) {
    return [...items];
  }

  return searchFuzzyIndex(
    createFuzzyIndex(items, options),
    query,
    items,
    options.limit,
  );
}

/** Insert relative to the hovered item, after removing the dragged item. */
export function insertSortableItem(
  ids: readonly string[],
  source: string,
  target: string,
  side: "before" | "after",
): string[] {
  if (source === target || !ids.includes(source) || !ids.includes(target))
    return [...ids];
  const remaining = ids.filter((id) => id !== source);
  const index = remaining.indexOf(target) + (side === "after" ? 1 : 0);
  remaining.splice(index, 0, source);
  return remaining;
}

export function sameSortableOrder(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

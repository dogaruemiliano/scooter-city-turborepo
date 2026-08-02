type CategoryNode = {
  id: string;
  kind: string;
  name: string;
  parentCategoryId: string | null;
};

type CategoryPathSegment = Pick<CategoryNode, "id" | "kind" | "name">;

const romanianCategoryCollator = new Intl.Collator("ro", {
  numeric: true,
  sensitivity: "base",
});

export function sortFinancialCategories<T extends CategoryNode>(
  categories: readonly T[],
): T[] {
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const pathById = new Map<string, CategoryPathSegment[]>();

  const categoryPath = (category: T): CategoryPathSegment[] => {
    const cached = pathById.get(category.id);
    if (cached) return cached;

    const path: CategoryPathSegment[] = [category];
    const visited = new Set([category.id]);
    let parentId = category.parentCategoryId;

    while (parentId) {
      if (visited.has(parentId)) break;
      visited.add(parentId);
      const parent = categoryById.get(parentId);
      if (!parent) break;
      path.unshift(parent);
      parentId = parent.parentCategoryId;
    }

    pathById.set(category.id, path);
    return path;
  };

  return [...categories].sort((left, right) => {
    const leftPath = categoryPath(left);
    const rightPath = categoryPath(right);
    const segmentCount = Math.min(leftPath.length, rightPath.length);

    for (let index = 0; index < segmentCount; index += 1) {
      const result = romanianCategoryCollator.compare(
        leftPath[index]?.name ?? "",
        rightPath[index]?.name ?? "",
      );
      if (result !== 0) return result;

      const leftSegment = leftPath[index];
      const rightSegment = rightPath[index];
      if (leftSegment && rightSegment && leftSegment.id !== rightSegment.id) {
        return (
          leftSegment.kind.localeCompare(rightSegment.kind) ||
          leftSegment.id.localeCompare(rightSegment.id)
        );
      }
    }

    return (
      leftPath.length - rightPath.length ||
      romanianCategoryCollator.compare(left.name, right.name) ||
      left.id.localeCompare(right.id)
    );
  });
}

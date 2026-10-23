export function memberName(
  member?: {
    id: string;
    email?: string;
    firstName: string | null;
    lastName: string | null;
  } | null,
) {
  return member
    ? [member.firstName, member.lastName]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ") ||
        member.email?.trim() ||
        member.id
    : "";
}

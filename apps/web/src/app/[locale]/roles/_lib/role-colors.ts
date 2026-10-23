export const roleColors: Record<string, { icon: string; title: string }> = {
  admin: { icon: "bg-info-subtle text-info", title: "text-info" },
  mechanic: {
    icon: "bg-warning-subtle text-warning-text",
    title: "text-warning-text",
  },
  customer: { icon: "bg-success-subtle text-success", title: "text-success" },
  superAdmin: {
    icon: "bg-personal-subtle text-personal",
    title: "text-personal",
  },
  none: {
    icon: "bg-secondary text-secondary-foreground",
    title: "text-foreground",
  },
};

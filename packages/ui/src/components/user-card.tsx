import type { ComponentProps } from "react";
import { PersonRow } from "./person-row";

/** Shared user identity card content for selection and assignment surfaces. */
export function UserCard({
  roles,
  ...props
}: Omit<ComponentProps<typeof PersonRow>, "description"> & {
  roles?: readonly { label: string; colorClassName: string }[];
}) {
  return (
    <PersonRow
      {...props}
      description={
        roles?.length ? (
          <span className="flex flex-wrap justify-start gap-x-2 gap-y-1">
            {roles.map((role) => (
              <span
                key={role.label}
                className={`font-medium ${role.colorClassName}`}
              >
                {role.label}
              </span>
            ))}
          </span>
        ) : undefined
      }
    />
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  PersonIdentityCard,
  PersonIdentityRow,
  type PersonSummary,
} from "@/components/PersonIdentity";
import { PersonContactSheet } from "@/components/PersonContactSheet";
import { loadPersonSelectItems } from "@/components/PersonSelect";
import { useRemote } from "@/components/WorkspaceForm";
import { useSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

const PersonsContext = createContext<ReadonlyMap<string, PersonSummary>>(
  new Map(),
);
/** One authorized directory load per rental screen, not one request per list row. */
export function RentalPersonsProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const { user } = useSession();
  const allowed = enabled && canAccess(user, "persons.read");
  const load = useCallback(
    () => (allowed ? loadPersonSelectItems() : Promise.resolve([])),
    [allowed],
  );
  const remote = useRemote(load);
  const people = useMemo(
    () => new Map((allowed ? (remote.data ?? []) : []).map((p) => [p.id, p])),
    [allowed, remote.data],
  );
  return (
    <PersonsContext.Provider value={people}>{children}</PersonsContext.Provider>
  );
}
export function RentalPersonCard({
  person,
  contacts = false,
  row = false,
}: {
  person: PersonSummary;
  contacts?: boolean;
  row?: boolean;
}) {
  const directory = useContext(PersonsContext);
  const summary = directory.get(person.id) ?? person;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {row ? (
        <PersonIdentityRow person={summary} />
      ) : (
        <PersonIdentityCard person={summary} />
      )}
      {contacts ? <PersonContactSheet person={summary} /> : null}
    </div>
  );
}

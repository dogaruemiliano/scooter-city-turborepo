-- Empty user overrides are intentional restrictions. Role grants must be nonempty.
ALTER TABLE "RolePermission" ALTER COLUMN "scopes" SET NOT NULL;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_scopes_nonempty" CHECK (cardinality("scopes") > 0);
ALTER TABLE "UserPermissionOverride" ALTER COLUMN "scopes" SET NOT NULL;
ALTER TABLE "Role" ADD CONSTRAINT "Role_revision_positive" CHECK (revision > 0);
ALTER TABLE "User" ADD CONSTRAINT "User_access_revision_positive" CHECK ("accessRevision" > 0);
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_dates_valid" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_status_valid" CHECK (status IN ('reserved', 'active', 'returned', 'cancelled'));
ALTER TABLE "ScooterProblem" ADD CONSTRAINT "ScooterProblem_status_valid" CHECK (status IN ('open', 'in_progress', 'resolved', 'cancelled'));
CREATE UNIQUE INDEX "UserInvitation_current_unique" ON "UserInvitation"("userId") WHERE "activatedAt" IS NULL AND "cancelledAt" IS NULL;

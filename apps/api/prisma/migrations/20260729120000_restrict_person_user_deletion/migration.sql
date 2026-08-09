-- A Person is part of rental/business history and must not disappear if code
-- accidentally attempts to hard-delete its User. Account deletion is handled
-- by setting User.deletedAt instead.
ALTER TABLE "Person"
  DROP CONSTRAINT "Person_userId_fkey";

ALTER TABLE "Person"
  ADD CONSTRAINT "Person_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

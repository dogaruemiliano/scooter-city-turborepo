-- Expand without deleting historical document values. Only promote an
-- unambiguous CNP that belongs to one person; conflicting legacy records remain
-- available in PersonDocument for deliberate correction.
ALTER TABLE "Person" ADD COLUMN "cnp" TEXT;

WITH candidates AS (
  SELECT "personId", min(regexp_replace(cnp, '\s', '', 'g')) AS cnp
  FROM "PersonDocument"
  WHERE cnp IS NOT NULL AND btrim(cnp) <> ''
  GROUP BY "personId"
  HAVING count(DISTINCT regexp_replace(cnp, '\s', '', 'g')) = 1
), unique_candidates AS (
  SELECT regexp_replace(cnp, '\s', '', 'g') AS cnp
  FROM "PersonDocument" WHERE regexp_replace(cnp, '\s', '', 'g') ~ '^[0-9]{13}$'
  GROUP BY regexp_replace(cnp, '\s', '', 'g') HAVING count(DISTINCT "personId") = 1
)
UPDATE "Person" p SET cnp = c.cnp
FROM candidates c JOIN unique_candidates u ON u.cnp = c.cnp
WHERE p.id = c."personId";

CREATE UNIQUE INDEX "Person_cnp_key" ON "Person"("cnp");

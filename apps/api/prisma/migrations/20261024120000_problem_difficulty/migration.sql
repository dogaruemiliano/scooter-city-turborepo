-- Preserve original severity and all problem relationships/history. Difficulty is
-- a separate assessment; this initial conversion is an agreed business mapping.
BEGIN;
ALTER TABLE "ScooterProblem" ADD COLUMN "difficulty" TEXT;
ALTER TABLE "ScooterProblem" ADD CONSTRAINT "ScooterProblem_difficulty_check"
  CHECK ("difficulty" IS NULL OR "difficulty" IN ('easy', 'medium', 'hard'));
UPDATE "ScooterProblem"
SET "difficulty" = CASE "severity"
  WHEN 'low' THEN 'easy'
  WHEN 'moderate' THEN 'medium'
  WHEN 'high' THEN 'hard'
  WHEN 'critical' THEN 'hard'
  ELSE NULL
END;
CREATE INDEX "ScooterProblem_difficulty_status_idx" ON "ScooterProblem"("difficulty", "status");
COMMIT;

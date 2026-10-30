-- Todos reuse the issue workflow without linking a scooter.
ALTER TABLE "ScooterProblem" ALTER COLUMN "scooterId" DROP NOT NULL;
ALTER TABLE "ScooterProblem" ADD CONSTRAINT "ScooterProblem_todo_no_hold"
  CHECK ("scooterId" IS NOT NULL OR "blocksUsage" = false);

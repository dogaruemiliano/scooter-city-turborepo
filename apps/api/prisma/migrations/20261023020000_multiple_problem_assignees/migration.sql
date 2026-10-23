-- CreateTable
CREATE TABLE "_ProblemAssignees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProblemAssignees_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ProblemAssignees_B_index" ON "_ProblemAssignees"("B");

-- AddForeignKey
ALTER TABLE "_ProblemAssignees" ADD CONSTRAINT "_ProblemAssignees_A_fkey" FOREIGN KEY ("A") REFERENCES "ScooterProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProblemAssignees" ADD CONSTRAINT "_ProblemAssignees_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve every existing assignment.
INSERT INTO "_ProblemAssignees" ("A", "B")
SELECT "id", "assigneeId" FROM "ScooterProblem" WHERE "assigneeId" IS NOT NULL;

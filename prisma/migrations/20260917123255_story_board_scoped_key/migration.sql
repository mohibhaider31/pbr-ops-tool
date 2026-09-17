-- DropIndex
DROP INDEX "Story_jiraKey_key";

-- CreateIndex
CREATE UNIQUE INDEX "Story_boardId_jiraKey_key" ON "Story"("boardId", "jiraKey");


-- DropIndex
DROP INDEX "Story_priorityOrder_idx";

-- CreateIndex
CREATE INDEX "Story_boardId_priorityOrder_idx" ON "Story"("boardId", "priorityOrder");

-- CreateIndex
CREATE INDEX "Comment_storyId_createdAt_idx" ON "Comment"("storyId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_storyId_isQuestion_idx" ON "Comment"("storyId", "isQuestion");

-- CreateIndex
CREATE INDEX "Comment_author_isQuestion_idx" ON "Comment"("author", "isQuestion");


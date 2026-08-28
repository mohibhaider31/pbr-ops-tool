-- AlterTable
ALTER TABLE "PokerItem" ADD COLUMN     "rediscussionScore" INTEGER,
ADD COLUMN     "refinementPollOpen" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StoryRefinement" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "flagCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryRefinement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefinementVote" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "voterName" TEXT NOT NULL,
    "needsWork" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefinementVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryRefinement_boardId_idx" ON "StoryRefinement"("boardId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryRefinement_boardId_jiraKey_key" ON "StoryRefinement"("boardId", "jiraKey");

-- CreateIndex
CREATE INDEX "RefinementVote_itemId_idx" ON "RefinementVote"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "RefinementVote_itemId_voterId_key" ON "RefinementVote"("itemId", "voterId");

-- AddForeignKey
ALTER TABLE "RefinementVote" ADD CONSTRAINT "RefinementVote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PokerItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


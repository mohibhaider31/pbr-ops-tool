-- AlterTable
ALTER TABLE "PokerSession" ADD COLUMN     "endedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PokerSession_boardId_createdAt_idx" ON "PokerSession"("boardId", "createdAt");

-- CreateIndex
CREATE INDEX "PokerSession_boardId_endedAt_idx" ON "PokerSession"("boardId", "endedAt");


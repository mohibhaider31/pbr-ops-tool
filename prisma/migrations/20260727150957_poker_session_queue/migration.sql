-- Clear any pre-existing poker rows (feature just launched, no real data).
DELETE FROM "PokerVote";
DELETE FROM "PokerSession";

-- CreateEnum
CREATE TYPE "PokerItemStatus" AS ENUM ('PENDING', 'DONE');

-- DropForeignKey
ALTER TABLE "PokerVote" DROP CONSTRAINT "PokerVote_sessionId_fkey";

-- DropIndex
DROP INDEX "PokerVote_sessionId_round_voterId_key";

-- AlterTable
ALTER TABLE "PokerSession" DROP COLUMN "finalPoints",
DROP COLUMN "jiraKey",
DROP COLUMN "round",
DROP COLUMN "state",
DROP COLUMN "summary",
ADD COLUMN     "currentItemId" TEXT;

-- AlterTable
ALTER TABLE "PokerVote" DROP COLUMN "sessionId",
ADD COLUMN     "itemId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "PokerItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "PokerItemStatus" NOT NULL DEFAULT 'PENDING',
    "state" "PokerState" NOT NULL DEFAULT 'VOTING',
    "round" INTEGER NOT NULL DEFAULT 1,
    "finalPoints" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PokerItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PokerItem_sessionId_idx" ON "PokerItem"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PokerVote_itemId_round_voterId_key" ON "PokerVote"("itemId", "round", "voterId");

-- AddForeignKey
ALTER TABLE "PokerItem" ADD CONSTRAINT "PokerItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PokerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PokerVote" ADD CONSTRAINT "PokerVote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PokerItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
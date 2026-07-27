-- CreateEnum
CREATE TYPE "PokerState" AS ENUM ('VOTING', 'REVEALED');

-- CreateTable
CREATE TABLE "PokerSession" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "organizerName" TEXT NOT NULL,
    "state" "PokerState" NOT NULL DEFAULT 'VOTING',
    "round" INTEGER NOT NULL DEFAULT 1,
    "finalPoints" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PokerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PokerVote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "voterId" TEXT NOT NULL,
    "voterName" TEXT NOT NULL,
    "card" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PokerVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PokerSession_code_key" ON "PokerSession"("code");

-- CreateIndex
CREATE INDEX "PokerSession_code_idx" ON "PokerSession"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PokerVote_sessionId_round_voterId_key" ON "PokerVote"("sessionId", "round", "voterId");

-- AddForeignKey
ALTER TABLE "PokerVote" ADD CONSTRAINT "PokerVote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PokerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;


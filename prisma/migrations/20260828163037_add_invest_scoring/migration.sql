-- AlterTable
ALTER TABLE "PokerItem" ADD COLUMN     "investPollOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "investScore" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "InvestVote" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "voterName" TEXT NOT NULL,
    "independent" BOOLEAN NOT NULL DEFAULT false,
    "negotiable" BOOLEAN NOT NULL DEFAULT false,
    "valuable" BOOLEAN NOT NULL DEFAULT false,
    "estimable" BOOLEAN NOT NULL DEFAULT false,
    "small" BOOLEAN NOT NULL DEFAULT false,
    "testable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvestVote_itemId_idx" ON "InvestVote"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestVote_itemId_voterId_key" ON "InvestVote"("itemId", "voterId");

-- AddForeignKey
ALTER TABLE "InvestVote" ADD CONSTRAINT "InvestVote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PokerItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


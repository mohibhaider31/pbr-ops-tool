-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "totpBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpSecret" TEXT;

-- CreateTable
CREATE TABLE "TotpChallenge" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TotpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TotpChallenge_tokenHash_key" ON "TotpChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "TotpChallenge_personId_idx" ON "TotpChallenge"("personId");

-- CreateIndex
CREATE INDEX "TotpChallenge_expiresAt_idx" ON "TotpChallenge"("expiresAt");


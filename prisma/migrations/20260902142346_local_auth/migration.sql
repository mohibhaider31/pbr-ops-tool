-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN     "authType" TEXT NOT NULL DEFAULT 'atlassian',
ALTER COLUMN "cloudId" DROP NOT NULL,
ALTER COLUMN "accessToken" DROP NOT NULL,
ALTER COLUMN "refreshToken" DROP NOT NULL,
ALTER COLUMN "accessExpiresAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "authType" TEXT NOT NULL DEFAULT 'atlassian',
ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "LocalInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "boardId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalInvite_tokenHash_key" ON "LocalInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "LocalInvite_email_idx" ON "LocalInvite"("email");

-- CreateIndex
CREATE INDEX "LocalInvite_expiresAt_idx" ON "LocalInvite"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");


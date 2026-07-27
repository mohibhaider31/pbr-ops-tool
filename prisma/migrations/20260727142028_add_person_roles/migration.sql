-- CreateEnum
CREATE TYPE "BoardRole" AS ENUM ('PO', 'BA', 'DEVELOPER', 'VIEWER');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "BoardRole" NOT NULL DEFAULT 'DEVELOPER',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'jira',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_accountId_key" ON "Person"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");


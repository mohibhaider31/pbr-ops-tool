-- CreateTable
CREATE TABLE "DismissedMention" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DismissedMention_accountId_idx" ON "DismissedMention"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "DismissedMention_accountId_commentId_key" ON "DismissedMention"("accountId", "commentId");


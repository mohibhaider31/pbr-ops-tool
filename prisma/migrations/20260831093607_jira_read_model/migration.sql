-- CreateTable
CREATE TABLE "JiraIssue" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusCategory" TEXT,
    "issueType" TEXT,
    "storyPoints" DOUBLE PRECISION,
    "assigneeAccountId" TEXT,
    "assigneeName" TEXT,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jiraUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JiraIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JiraSyncState" (
    "boardId" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "syncing" BOOLEAN NOT NULL DEFAULT false,
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraSyncState_pkey" PRIMARY KEY ("boardId")
);

-- CreateIndex
CREATE INDEX "JiraIssue_boardId_status_idx" ON "JiraIssue"("boardId", "status");

-- CreateIndex
CREATE INDEX "JiraIssue_assigneeAccountId_idx" ON "JiraIssue"("assigneeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "JiraIssue_boardId_jiraKey_key" ON "JiraIssue"("boardId", "jiraKey");


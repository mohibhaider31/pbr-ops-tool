-- CreateTable
CREATE TABLE "RoadmapEntry" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "version" TEXT,
    "lane" TEXT NOT NULL DEFAULT 'PRODUCT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "order" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapMilestone" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'RELEASE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoadmapEntry_boardId_targetDate_idx" ON "RoadmapEntry"("boardId", "targetDate");

-- CreateIndex
CREATE INDEX "RoadmapEntry_boardId_lane_idx" ON "RoadmapEntry"("boardId", "lane");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapEntry_boardId_jiraKey_key" ON "RoadmapEntry"("boardId", "jiraKey");

-- CreateIndex
CREATE INDEX "RoadmapMilestone_boardId_date_idx" ON "RoadmapMilestone"("boardId", "date");


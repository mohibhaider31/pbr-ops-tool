-- CreateTable
CREATE TABLE "PipelineItem" (
    "id" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineItem_jiraKey_key" ON "PipelineItem"("jiraKey");


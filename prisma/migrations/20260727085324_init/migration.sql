-- CreateEnum
CREATE TYPE "StoryStage" AS ENUM ('BACKLOG', 'ASSIGNED', 'IN_REVIEW', 'PBR_DONE');

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "priorityOrder" INTEGER NOT NULL DEFAULT 0,
    "stage" "StoryStage" NOT NULL DEFAULT 'BACKLOG',
    "pbrDoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignee" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "markedDone" BOOLEAN NOT NULL DEFAULT false,
    "markedDoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isQuestion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Story_jiraKey_key" ON "Story"("jiraKey");

-- CreateIndex
CREATE INDEX "Story_priorityOrder_idx" ON "Story"("priorityOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Assignee_storyId_email_key" ON "Assignee"("storyId", "email");

-- AddForeignKey
ALTER TABLE "Assignee" ADD CONSTRAINT "Assignee_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;


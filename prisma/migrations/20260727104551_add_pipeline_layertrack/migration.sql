-- CreateEnum
CREATE TYPE "Layer" AS ENUM ('ENGINE', 'MIDDLEWARE', 'FRONTEND');

-- CreateEnum
CREATE TYPE "LayerStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED');

-- CreateTable
CREATE TABLE "LayerTrack" (
    "id" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "layer" "Layer" NOT NULL,
    "status" "LayerStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "owner" TEXT,
    "sprint" TEXT,
    "doneAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LayerTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LayerTrack_jiraKey_idx" ON "LayerTrack"("jiraKey");

-- CreateIndex
CREATE UNIQUE INDEX "LayerTrack_jiraKey_layer_key" ON "LayerTrack"("jiraKey", "layer");


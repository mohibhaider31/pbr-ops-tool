-- Multi-tenancy Phase 1: introduce Board + BoardMembership, scope operational
-- data by boardId, and migrate the single implicit RAE board into a real row.
-- Ordered carefully: create structures and backfill data BEFORE dropping the
-- old Person.role column, so existing roles migrate into memberships.

-- 1. New tables
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jiraProjectKey" TEXT NOT NULL,
    "backlogStatus" TEXT NOT NULL DEFAULT 'To Do',
    "readyForDevStatus" TEXT NOT NULL DEFAULT 'Ready For Dev',
    "pbrDonePath" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Board_jiraProjectKey_key" ON "Board"("jiraProjectKey");

CREATE TABLE "BoardMembership" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "role" "BoardRole" NOT NULL DEFAULT 'DEVELOPER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BoardMembership_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BoardMembership_boardId_idx" ON "BoardMembership"("boardId");
CREATE UNIQUE INDEX "BoardMembership_personId_boardId_key" ON "BoardMembership"("personId", "boardId");

-- 2. Add boardId columns (nullable-safe via default '')
ALTER TABLE "Story" ADD COLUMN "boardId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LayerTrack" ADD COLUMN "boardId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PipelineItem" ADD COLUMN "boardId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PokerSession" ADD COLUMN "boardId" TEXT NOT NULL DEFAULT '';

-- 3. Seed the RAE board (the one implicit board so far)
INSERT INTO "Board" ("id", "name", "jiraProjectKey", "backlogStatus", "readyForDevStatus", "pbrDonePath", "isDefault", "createdAt", "updatedAt")
VALUES (
  'board_rae',
  'RAE Risk Engine',
  'RAE',
  'To Do',
  'Ready For Dev',
  'Requirement Analysis,Requirement Documentation,Pending PO Review,Ready For Dev',
  true,
  now(),
  now()
);

-- 4. Backfill all existing operational rows to the RAE board
UPDATE "Story" SET "boardId" = 'board_rae' WHERE "boardId" = '';
UPDATE "LayerTrack" SET "boardId" = 'board_rae' WHERE "boardId" = '';
UPDATE "PipelineItem" SET "boardId" = 'board_rae' WHERE "boardId" = '';
UPDATE "PokerSession" SET "boardId" = 'board_rae' WHERE "boardId" = '';

-- 5. Migrate each Person.role into a BoardMembership on the RAE board
INSERT INTO "BoardMembership" ("id", "personId", "boardId", "role", "createdAt", "updatedAt")
SELECT
  'bm_' || "id",
  "id",
  'board_rae',
  "role",
  now(),
  now()
FROM "Person";

-- 6. Now safe to drop the old per-person global role and old unique indexes
ALTER TABLE "Person" DROP COLUMN "role";
DROP INDEX IF EXISTS "LayerTrack_jiraKey_layer_key";
DROP INDEX IF EXISTS "PipelineItem_jiraKey_key";

-- 7. New board-scoped indexes
CREATE INDEX "Story_boardId_idx" ON "Story"("boardId");
CREATE UNIQUE INDEX "LayerTrack_boardId_jiraKey_layer_key" ON "LayerTrack"("boardId", "jiraKey", "layer");
CREATE INDEX "PipelineItem_boardId_idx" ON "PipelineItem"("boardId");
CREATE UNIQUE INDEX "PipelineItem_boardId_jiraKey_key" ON "PipelineItem"("boardId", "jiraKey");

-- 8. Foreign keys
ALTER TABLE "BoardMembership" ADD CONSTRAINT "BoardMembership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardMembership" ADD CONSTRAINT "BoardMembership_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

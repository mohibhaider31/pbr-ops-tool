-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "firstLoginAt" TIMESTAMP(3);


-- Backfill: anyone who already has an auth session has clearly logged in.
-- Mark them Active as of now so they don't show as "Invited" retroactively.
UPDATE "Person" p
SET "firstLoginAt" = now()
WHERE "firstLoginAt" IS NULL
  AND EXISTS (SELECT 1 FROM "AuthSession" s WHERE s."accountId" = p."accountId");

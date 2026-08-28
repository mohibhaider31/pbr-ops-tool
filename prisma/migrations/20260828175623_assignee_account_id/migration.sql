-- AlterTable
ALTER TABLE "Assignee" ADD COLUMN     "accountId" TEXT;

-- CreateIndex
CREATE INDEX "Assignee_accountId_idx" ON "Assignee"("accountId");


-- AlterTable: Approval.level
ALTER TABLE "Approval" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: IssueRecord witness + signature
ALTER TABLE "IssueRecord" ADD COLUMN "witnessId" TEXT;
ALTER TABLE "IssueRecord" ADD COLUMN "signatureDataUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Approval_requestId_level_action_key" ON "Approval"("requestId", "level", "action");

-- CreateIndex
CREATE INDEX "IssueRecord_witnessId_idx" ON "IssueRecord"("witnessId");

-- AddForeignKey
ALTER TABLE "IssueRecord" ADD CONSTRAINT "IssueRecord_witnessId_fkey" FOREIGN KEY ("witnessId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ControlledLedgerSnapshot" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "csvContent" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlledLedgerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ControlledLedgerSnapshot_labId_yearMonth_key" ON "ControlledLedgerSnapshot"("labId", "yearMonth");

-- CreateIndex
CREATE INDEX "ControlledLedgerSnapshot_labId_idx" ON "ControlledLedgerSnapshot"("labId");

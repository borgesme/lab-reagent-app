-- CreateEnum
CREATE TYPE "HazardLevel" AS ENUM ('NORMAL', 'DANGEROUS', 'CONTROLLED');

-- CreateEnum
CREATE TYPE "ControlType" AS ENUM ('DRUG_PRECURSOR', 'EXPLOSIVE_PRECURSOR', 'TOXIC', 'NARCOTIC');

-- CreateTable
CREATE TABLE "Reagent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cas" TEXT,
    "formula" TEXT,
    "specification" TEXT,
    "category" TEXT,
    "hazardLevel" "HazardLevel" NOT NULL DEFAULT 'NORMAL',
    "controlType" "ControlType",
    "msdsFileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Reagent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReagentStock" (
    "id" TEXT NOT NULL,
    "reagentId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "batchNo" TEXT,
    "mfgDate" TIMESTAMP(3),
    "expireDate" TIMESTAMP(3),
    "initialQty" DECIMAL(12,3) NOT NULL,
    "currentQty" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "location" TEXT,
    "supplier" TEXT,
    "purchasePrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReagentStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reagent_name_idx" ON "Reagent"("name");

-- CreateIndex
CREATE INDEX "Reagent_cas_idx" ON "Reagent"("cas");

-- CreateIndex
CREATE INDEX "ReagentStock_reagentId_idx" ON "ReagentStock"("reagentId");

-- CreateIndex
CREATE INDEX "ReagentStock_labId_idx" ON "ReagentStock"("labId");

-- CreateIndex
CREATE INDEX "ReagentStock_expireDate_idx" ON "ReagentStock"("expireDate");

-- AddForeignKey
ALTER TABLE "ReagentStock" ADD CONSTRAINT "ReagentStock_reagentId_fkey" FOREIGN KEY ("reagentId") REFERENCES "Reagent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReagentStock" ADD CONSTRAINT "ReagentStock_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

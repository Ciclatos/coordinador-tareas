ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'CONSOLIDATED' AFTER 'FINALIZED';

ALTER TABLE "Assignment"
  ADD COLUMN "finalizedAt" TIMESTAMP(3),
  ADD COLUMN "consolidatedAt" TIMESTAMP(3),
  ADD COLUMN "autoConsolidateDays" INTEGER,
  ADD COLUMN "consolidatedBytes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SubmissionFile"
  ALTER COLUMN "storageKey" DROP NOT NULL,
  ADD COLUMN "binaryDeletedAt" TIMESTAMP(3);

ALTER TABLE "MemberEvaluation"
  ADD COLUMN "includeCommentsInReport" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Report"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "sourceSnapshotAt" TIMESTAMP(3),
  ADD COLUMN "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "includeIndividualComments" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PdfBuild"
  ADD COLUMN "qualityProfile" TEXT NOT NULL DEFAULT 'balanced',
  ADD COLUMN "sourceBytes" INTEGER;

ALTER TABLE "Assignment"
  ADD CONSTRAINT "Assignment_autoConsolidateDays_check"
  CHECK ("autoConsolidateDays" IS NULL OR "autoConsolidateDays" IN (7, 14, 30));

-- Antes de esta fase, guardar cualquier PDF marcaba la tarea como FINALIZED sin
-- confirmación. Se restablecen esas filas a revisión para impedir que archivos
-- históricos entren accidentalmente al nuevo flujo destructivo.
UPDATE "Assignment" SET "status" = 'REVIEW' WHERE "status" = 'FINALIZED';

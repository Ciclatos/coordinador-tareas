ALTER TABLE "Submission"
ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "firstReceivedAt" TIMESTAMP(3),
ADD COLUMN "lastReceivedAt" TIMESTAMP(3),
ADD COLUMN "minutesLate" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reviewComment" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3);

UPDATE "Submission"
SET "firstReceivedAt" = "receivedAt", "lastReceivedAt" = "receivedAt"
WHERE "receivedAt" IS NOT NULL;

ALTER TABLE "SubmissionVersion"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "receiptCode" TEXT,
ADD COLUMN "assignmentSnapshot" JSONB;

CREATE UNIQUE INDEX "SubmissionVersion_idempotencyKey_key" ON "SubmissionVersion"("idempotencyKey");
CREATE UNIQUE INDEX "SubmissionVersion_receiptCode_key" ON "SubmissionVersion"("receiptCode");

CREATE TABLE "AssignmentSubmissionPortal" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenCipher" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "opensAt" TIMESTAMP(3),
  "closesAt" TIMESTAMP(3),
  "allowLateSubmissions" BOOLEAN NOT NULL DEFAULT false,
  "allowReplacements" BOOLEAN NOT NULL DEFAULT true,
  "maxReplacements" INTEGER NOT NULL DEFAULT 2,
  "maxFileSize" INTEGER NOT NULL DEFAULT 26214400,
  "allowedMimeTypes" JSONB NOT NULL,
  "instructions" TEXT,
  "tokenVersion" INTEGER NOT NULL DEFAULT 1,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssignmentSubmissionPortal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssignmentSubmissionPortal_assignmentId_key" ON "AssignmentSubmissionPortal"("assignmentId");
CREATE UNIQUE INDEX "AssignmentSubmissionPortal_tokenHash_key" ON "AssignmentSubmissionPortal"("tokenHash");
CREATE INDEX "AssignmentSubmissionPortal_enabled_opensAt_closesAt_idx" ON "AssignmentSubmissionPortal"("enabled", "opensAt", "closesAt");

CREATE TABLE "SubmissionAuditEvent" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "portalId" TEXT,
  "memberId" TEXT,
  "submissionId" TEXT,
  "eventType" TEXT NOT NULL,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubmissionAuditEvent_portalId_eventType_createdAt_idx" ON "SubmissionAuditEvent"("portalId", "eventType", "createdAt");
CREATE INDEX "SubmissionAuditEvent_portalId_memberId_eventType_createdAt_idx" ON "SubmissionAuditEvent"("portalId", "memberId", "eventType", "createdAt");
CREATE INDEX "SubmissionAuditEvent_assignmentId_createdAt_idx" ON "SubmissionAuditEvent"("assignmentId", "createdAt");

ALTER TABLE "AssignmentSubmissionPortal" ADD CONSTRAINT "AssignmentSubmissionPortal_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionAuditEvent" ADD CONSTRAINT "SubmissionAuditEvent_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionAuditEvent" ADD CONSTRAINT "SubmissionAuditEvent_portalId_fkey"
FOREIGN KEY ("portalId") REFERENCES "AssignmentSubmissionPortal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubmissionAuditEvent" ADD CONSTRAINT "SubmissionAuditEvent_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

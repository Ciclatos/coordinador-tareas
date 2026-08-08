ALTER TABLE "Assignment" ADD COLUMN "contentUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MemberEvaluation" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PdfBuild" ADD COLUMN "contentSnapshotAt" TIMESTAMP(3);

CREATE TABLE "ActiveAssignmentPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ActiveAssignmentPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActiveAssignmentPreference_userId_courseId_key" ON "ActiveAssignmentPreference"("userId", "courseId");
CREATE INDEX "ActiveAssignmentPreference_assignmentId_idx" ON "ActiveAssignmentPreference"("assignmentId");
ALTER TABLE "ActiveAssignmentPreference" ADD CONSTRAINT "ActiveAssignmentPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActiveAssignmentPreference" ADD CONSTRAINT "ActiveAssignmentPreference_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActiveAssignmentPreference" ADD CONSTRAINT "ActiveAssignmentPreference_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AssignmentExclusion" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentExclusion_assignmentId_idx" ON "AssignmentExclusion"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentExclusion_assignmentId_memberId_key" ON "AssignmentExclusion"("assignmentId", "memberId");

-- AddForeignKey
ALTER TABLE "AssignmentExclusion" ADD CONSTRAINT "AssignmentExclusion_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentExclusion" ADD CONSTRAINT "AssignmentExclusion_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CourseMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

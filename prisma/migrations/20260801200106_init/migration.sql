-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'DISTRIBUTED', 'RECEIVING', 'REVIEW', 'FINALIZED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'LATE', 'REVIEWING', 'NEEDS_CORRECTION', 'CORRECTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('PDF', 'IMAGE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "university" TEXT,
    "faculty" TEXT,
    "campus" TEXT,
    "shift" TEXT,
    "degree" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Guatemala',
    "systemName" TEXT NOT NULL DEFAULT 'Coordinador de Tareas',
    "documentPreferences" JSONB,
    "logoPath" TEXT,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "teacher" TEXT,
    "degree" TEXT,
    "faculty" TEXT,
    "university" TEXT,
    "campus" TEXT,
    "shift" TEXT,
    "cycle" TEXT,
    "semester" TEXT,
    "section" TEXT,
    "groupNumber" TEXT,
    "academicYear" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "logoPath" TEXT,
    "defaultPdfOrder" JSONB,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseMember" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "carnet" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "workloadBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "CourseMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "instructions" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "coordinatorNotes" TEXT,
    "pdfOrder" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentSection" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "rule" JSONB,
    "notes" TEXT,
    "defaultWeight" DOUBLE PRECISION,

    CONSTRAINT "AssignmentSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseAssignment" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "seed" TEXT,

    CONSTRAINT "ExerciseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3),
    "late" BOOLEAN NOT NULL DEFAULT false,
    "comments" TEXT,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionVersion" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionFile" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "exerciseId" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "sha256" TEXT NOT NULL,

    CONSTRAINT "SubmissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationTemplate" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EvaluationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCriterion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "EvaluationCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberEvaluation" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "comments" TEXT,

    CONSTRAINT "MemberEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterionScore" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,

    CONSTRAINT "CriterionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "generatorVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverTemplate" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storageKey" TEXT,
    "coordinates" JSONB,
    "gradingTable" JSONB NOT NULL,

    CONSTRAINT "CoverTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfBuild" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "storageKey" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfBuild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfBuildItem" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "selectedPages" JSONB,

    CONSTRAINT "PdfBuildItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupWorkloadSnapshot" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "exerciseCount" INTEGER NOT NULL,
    "totalWeight" DOUBLE PRECISION NOT NULL,
    "extraCount" INTEGER NOT NULL,
    "lateCount" INTEGER NOT NULL,
    "grade" DOUBLE PRECISION,
    "sections" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupWorkloadSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "Course_userId_active_idx" ON "Course"("userId", "active");

-- CreateIndex
CREATE INDEX "CourseMember_courseId_active_idx" ON "CourseMember"("courseId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CourseMember_courseId_carnet_key" ON "CourseMember"("courseId", "carnet");

-- CreateIndex
CREATE INDEX "Assignment_courseId_status_dueAt_idx" ON "Assignment"("courseId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_courseId_number_key" ON "Assignment"("courseId", "number");

-- CreateIndex
CREATE INDEX "AssignmentSection_assignmentId_sortOrder_idx" ON "AssignmentSection"("assignmentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSection_assignmentId_name_key" ON "AssignmentSection"("assignmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_sectionId_label_key" ON "Exercise"("sectionId", "label");

-- CreateIndex
CREATE INDEX "ExerciseAssignment_assignmentId_memberId_idx" ON "ExerciseAssignment"("assignmentId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseAssignment_assignmentId_exerciseId_key" ON "ExerciseAssignment"("assignmentId", "exerciseId");

-- CreateIndex
CREATE INDEX "Submission_assignmentId_status_idx" ON "Submission"("assignmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionVersion_submissionId_version_key" ON "SubmissionVersion"("submissionId", "version");

-- CreateIndex
CREATE INDEX "SubmissionFile_versionId_sortOrder_idx" ON "SubmissionFile"("versionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MemberEvaluation_assignmentId_memberId_key" ON "MemberEvaluation"("assignmentId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionScore_evaluationId_criterionId_key" ON "CriterionScore"("evaluationId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "PdfBuild_assignmentId_version_key" ON "PdfBuild"("assignmentId", "version");

-- CreateIndex
CREATE INDEX "PdfBuildItem_buildId_sortOrder_idx" ON "PdfBuildItem"("buildId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GroupWorkloadSnapshot_assignmentId_memberId_key" ON "GroupWorkloadSnapshot"("assignmentId", "memberId");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMember" ADD CONSTRAINT "CourseMember_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSection" ADD CONSTRAINT "AssignmentSection_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "AssignmentSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAssignment" ADD CONSTRAINT "ExerciseAssignment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAssignment" ADD CONSTRAINT "ExerciseAssignment_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAssignment" ADD CONSTRAINT "ExerciseAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CourseMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CourseMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionVersion" ADD CONSTRAINT "SubmissionVersion_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SubmissionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationTemplate" ADD CONSTRAINT "EvaluationTemplate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCriterion" ADD CONSTRAINT "EvaluationCriterion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EvaluationTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberEvaluation" ADD CONSTRAINT "MemberEvaluation_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberEvaluation" ADD CONSTRAINT "MemberEvaluation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CourseMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionScore" ADD CONSTRAINT "CriterionScore_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "MemberEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionScore" ADD CONSTRAINT "CriterionScore_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "EvaluationCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverTemplate" ADD CONSTRAINT "CoverTemplate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfBuild" ADD CONSTRAINT "PdfBuild_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfBuildItem" ADD CONSTRAINT "PdfBuildItem_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "PdfBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupWorkloadSnapshot" ADD CONSTRAINT "GroupWorkloadSnapshot_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupWorkloadSnapshot" ADD CONSTRAINT "GroupWorkloadSnapshot_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CourseMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

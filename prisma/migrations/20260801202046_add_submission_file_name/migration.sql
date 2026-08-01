/*
  Warnings:

  - Added the required column `originalName` to the `SubmissionFile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SubmissionFile" ADD COLUMN     "originalName" TEXT NOT NULL;

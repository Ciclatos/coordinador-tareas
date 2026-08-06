ALTER TABLE "User"
ADD COLUMN "tutorialEligible" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "TutorialStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

CREATE TABLE "UserTutorialProgress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tutorialKey" TEXT NOT NULL,
  "status" "TutorialStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "currentStep" INTEGER,
  "tutorialVersion" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "skippedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserTutorialProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserTutorialProgress_userId_tutorialKey_key"
ON "UserTutorialProgress"("userId", "tutorialKey");

CREATE INDEX "UserTutorialProgress_userId_status_idx"
ON "UserTutorialProgress"("userId", "status");

ALTER TABLE "UserTutorialProgress"
ADD CONSTRAINT "UserTutorialProgress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

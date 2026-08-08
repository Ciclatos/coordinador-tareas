import AppShell from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getDashboardData } from "@/data/dashboard";
import type { TutorialProgressDto } from "@/lib/tutorial-progress";
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ assignment?: string; view?: string }>;
}) {
  const { userId } = await requireSession();
  const query = await searchParams;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      tutorialEligible: true,
      tutorialProgress: {
        select: { tutorialKey: true, status: true, currentStep: true, tutorialVersion: true },
      },
      profile: {
        select: {
          name: true,
          systemName: true,
          university: true,
          faculty: true,
          campus: true,
          shift: true,
          degree: true,
        },
      },
    },
  });
  const data = await getDashboardData(userId);
  const preferred = await prisma.activeAssignmentPreference.findFirst({
    where: { userId, courseId: data[0]?.id },
    select: { assignmentId: true },
  });
  const requestedAssignmentId =
    typeof query.assignment === "string" ? query.assignment : undefined;
  return (
    <AppShell
      initialData={data}
      tutorialEligible={user.tutorialEligible}
      tutorialProgress={user.tutorialProgress as TutorialProgressDto[]}
      initialAssignmentId={requestedAssignmentId ?? preferred?.assignmentId}
      initialView={typeof query.view === "string" ? query.view : undefined}
      currentUser={{
        name: user.profile?.name ?? user.email,
        systemName: user.profile?.systemName ?? "Coordinador de Tareas",
        university: user.profile?.university ?? null,
        faculty: user.profile?.faculty ?? null,
        campus: user.profile?.campus ?? null,
        shift: user.profile?.shift ?? null,
        degree: user.profile?.degree ?? null,
      }}
    />
  );
}

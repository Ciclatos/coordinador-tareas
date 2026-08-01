import AppShell from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getDashboardData } from "@/data/dashboard";
export default async function DashboardPage() {
  const { userId } = await requireSession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
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
  return (
    <AppShell
      initialData={data}
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

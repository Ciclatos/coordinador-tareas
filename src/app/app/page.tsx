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
      profile: { select: { name: true, systemName: true } },
    },
  });
  const data = await getDashboardData(userId);
  return (
    <AppShell
      initialData={data}
      currentUser={{
        name: user.profile?.name ?? user.email,
        systemName: user.profile?.systemName ?? "Coordinador de Tareas",
      }}
    />
  );
}

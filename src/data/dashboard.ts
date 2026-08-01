import "server-only";
import { prisma } from "@/lib/prisma";

export async function getDashboardData(userId: string) {
  const courses = await prisma.course.findMany({
    where: { userId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      teacher: true,
      section: true,
      groupNumber: true,
      academicYear: true,
      active: true,
      members: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          fullName: true,
          shortName: true,
          carnet: true,
          email: true,
          workloadBalance: true,
          active: true,
        },
      },
      assignments: {
        orderBy: { dueAt: "desc" },
        take: 20,
        select: {
          id: true,
          number: true,
          weekNumber: true,
          title: true,
          topic: true,
          dueAt: true,
          status: true,
          _count: { select: { sections: true, submissions: true } },
        },
      },
    },
  });
  return courses.map((course) => ({
    ...course,
    assignments: course.assignments.map((assignment) => ({
      ...assignment,
      dueAt: assignment.dueAt.toISOString(),
    })),
  }));
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

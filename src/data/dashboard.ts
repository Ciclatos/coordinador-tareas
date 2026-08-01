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
          sections: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              name: true,
              exercises: {
                orderBy: { sortOrder: "asc" },
                select: { id: true, label: true },
              },
            },
          },
          submissions: {
            orderBy: { receivedAt: "desc" },
            select: {
              id: true,
              status: true,
              late: true,
              receivedAt: true,
              member: { select: { id: true, fullName: true } },
              versions: {
                orderBy: { version: "desc" },
                take: 1,
                select: {
                  version: true,
                  createdAt: true,
                  files: {
                    orderBy: { sortOrder: "asc" },
                    select: {
                      id: true,
                      originalName: true,
                      mimeType: true,
                      sizeBytes: true,
                    },
                  },
                },
              },
            },
          },
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
      submissions: assignment.submissions.map((submission) => ({
        ...submission,
        receivedAt: submission.receivedAt?.toISOString() ?? null,
        versions: submission.versions.map((version) => ({
          ...version,
          createdAt: version.createdAt.toISOString(),
        })),
      })),
    })),
  }));
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

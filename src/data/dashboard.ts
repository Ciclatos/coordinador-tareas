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
      degree: true,
      faculty: true,
      university: true,
      campus: true,
      shift: true,
      cycle: true,
      semester: true,
      section: true,
      groupNumber: true,
      academicYear: true,
      active: true,
      templates: {
        where: { active: true },
        orderBy: { id: "asc" },
        take: 1,
        select: {
          id: true,
          name: true,
          criteria: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, maxScore: true, sortOrder: true },
          },
        },
      },
      members: {
        orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          fullName: true,
          shortName: true,
          carnet: true,
          email: true,
          phone: true,
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
          weekStart: true,
          weekEnd: true,
          instructions: true,
          coordinatorNotes: true,
          dueAt: true,
          status: true,
          pdfOrder: true,
          exclusions: { select: { memberId: true, reason: true } },
          sections: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              name: true,
              rule: true,
              notes: true,
              defaultWeight: true,
              exercises: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  label: true,
                  weight: true,
                  allocations: {
                    select: { memberId: true, locked: true },
                  },
                },
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
                      rotation: true,
                      pageCount: true,
                      exerciseId: true,
                    },
                  },
                },
              },
            },
          },
          evaluations: {
            select: {
              memberId: true,
              total: true,
              comments: true,
              scores: {
                select: {
                  score: true,
                  reason: true,
                  criterion: { select: { name: true, maxScore: true, sortOrder: true } },
                },
                orderBy: { criterion: { sortOrder: "asc" } },
              },
            },
          },
          reports: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, body: true, generatorVersion: true, createdAt: true },
          },
          pdfBuilds: {
            where: { status: "READY", storageKey: { not: null } },
            orderBy: { version: "desc" },
            take: 10,
            select: { id: true, version: true, sizeBytes: true, createdAt: true },
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
      weekStart: assignment.weekStart.toISOString(),
      weekEnd: assignment.weekEnd.toISOString(),
      reports: assignment.reports.map((report) => ({
        ...report,
        createdAt: report.createdAt.toISOString(),
      })),
      pdfBuilds: assignment.pdfBuilds.map((build) => ({
        ...build,
        createdAt: build.createdAt.toISOString(),
      })),
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

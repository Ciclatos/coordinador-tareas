import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptPortalToken } from "@/lib/submission-portal";
import { submissionDataIssue } from "@/lib/submission-dto";

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
          updatedAt: true,
          contentUpdatedAt: true,
          submissionPortal: {
            select: {
              id: true,
              enabled: true,
              opensAt: true,
              closesAt: true,
              allowLateSubmissions: true,
              allowReplacements: true,
              maxReplacements: true,
              maxFileSize: true,
              allowedMimeTypes: true,
              instructions: true,
              tokenCipher: true,
              tokenVersion: true,
            },
          },
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
              origin: true,
              firstReceivedAt: true,
              lastReceivedAt: true,
              minutesLate: true,
              reviewComment: true,
              approvedAt: true,
              _count: { select: { versions: true } },
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
              updatedAt: true,
              scores: {
                select: {
                  score: true,
                  reason: true,
                  criterion: {
                    select: { name: true, maxScore: true, sortOrder: true },
                  },
                },
                orderBy: { criterion: { sortOrder: "asc" } },
              },
            },
          },
          reports: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              body: true,
              generatorVersion: true,
              createdAt: true,
            },
          },
          pdfBuilds: {
            where: { status: "READY", storageKey: { not: null } },
            orderBy: { version: "desc" },
            take: 10,
            select: {
              id: true,
              version: true,
              sizeBytes: true,
              createdAt: true,
              contentSnapshotAt: true,
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
      submissionPortal: assignment.submissionPortal
        ? serializePortal(assignment.id, assignment.submissionPortal)
        : null,
      dueAt: assignment.dueAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
      contentUpdatedAt: assignment.contentUpdatedAt.toISOString(),
      weekStart: assignment.weekStart.toISOString(),
      weekEnd: assignment.weekEnd.toISOString(),
      reports: assignment.reports.map((report) => ({
        ...report,
        createdAt: report.createdAt.toISOString(),
      })),
      pdfBuilds: assignment.pdfBuilds.map((build) => ({
        ...build,
        createdAt: build.createdAt.toISOString(),
        contentSnapshotAt: build.contentSnapshotAt?.toISOString() ?? null,
      })),
      evaluations: assignment.evaluations.map((evaluation) => ({
        ...evaluation,
        updatedAt: evaluation.updatedAt.toISOString(),
      })),
      submissions: assignment.submissions.map((submission) => ({
        ...submission,
        receivedAt: submission.receivedAt?.toISOString() ?? null,
        firstReceivedAt: submission.firstReceivedAt?.toISOString() ?? null,
        lastReceivedAt: submission.lastReceivedAt?.toISOString() ?? null,
        approvedAt: submission.approvedAt?.toISOString() ?? null,
        dataIssue: submissionDataIssue({
          status: submission.status,
          versionCount: submission._count.versions,
          currentVersion: submission.versions[0],
        }),
        versions: submission.versions.map((version) => ({
          ...version,
          createdAt: version.createdAt.toISOString(),
        })),
      })),
    })),
  }));
}

function serializePortal(
  assignmentId: string,
  portal: {
    id: string;
    enabled: boolean;
    opensAt: Date | null;
    closesAt: Date | null;
    allowLateSubmissions: boolean;
    allowReplacements: boolean;
    maxReplacements: number;
    maxFileSize: number;
    allowedMimeTypes: unknown;
    instructions: string | null;
    tokenCipher: string;
    tokenVersion: number;
  },
) {
  let token: string | null = null;
  let tokenIssue: string | null = null;
  try {
    token = decryptPortalToken(portal.tokenCipher);
  } catch (error) {
    tokenIssue =
      "El enlace guardado no puede recuperarse; regenérelo para continuar.";
    console.error(
      "[dashboard:submission-portal] No se pudo descifrar el token",
      {
        assignmentId,
        portalId: portal.id,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    );
  }
  const allowedMimeTypes = Array.isArray(portal.allowedMimeTypes)
    ? portal.allowedMimeTypes.filter(
        (value): value is string => typeof value === "string",
      )
    : ["application/pdf"];
  return {
    id: portal.id,
    enabled: portal.enabled,
    opensAt: portal.opensAt?.toISOString() ?? null,
    closesAt: portal.closesAt?.toISOString() ?? null,
    allowLateSubmissions: portal.allowLateSubmissions,
    allowReplacements: portal.allowReplacements,
    maxReplacements: portal.maxReplacements,
    maxFileSize: portal.maxFileSize,
    allowedMimeTypes,
    instructions: portal.instructions,
    tokenVersion: portal.tokenVersion,
    token,
    tokenIssue,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

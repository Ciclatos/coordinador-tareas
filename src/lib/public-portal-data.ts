import "server-only";
import { prisma } from "@/lib/prisma";
import {
  hashPortalToken,
  portalState,
  publicMemberReference,
} from "@/lib/submission-portal";

export async function findPublicPortal(rawToken: string) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(rawToken)) return null;
  return prisma.assignmentSubmissionPortal.findUnique({
    where: { tokenHash: hashPortalToken(rawToken) },
    include: {
      assignment: {
        include: {
          course: { include: { members: { orderBy: { sortOrder: "asc" } } } },
          exclusions: true,
          sections: {
            orderBy: { sortOrder: "asc" },
            include: {
              exercises: {
                orderBy: { sortOrder: "asc" },
                include: { allocations: true },
              },
            },
          },
          submissions: {
            include: {
              versions: {
                orderBy: { version: "desc" },
                include: { files: true },
              },
            },
          },
        },
      },
    },
  });
}

export function eligibleMembers(
  portal: NonNullable<Awaited<ReturnType<typeof findPublicPortal>>>,
) {
  const excluded = new Set(
    portal.assignment.exclusions.map((item) => item.memberId),
  );
  const allocated = new Set(
    portal.assignment.sections.flatMap((section) =>
      section.exercises.flatMap((exercise) =>
        exercise.allocations.map((item) => item.memberId),
      ),
    ),
  );
  return portal.assignment.course.members.filter(
    (member) =>
      member.active && allocated.has(member.id) && !excluded.has(member.id),
  );
}

export function publicPortalSummary(
  portal: NonNullable<Awaited<ReturnType<typeof findPublicPortal>>>,
) {
  const assignment = portal.assignment;
  return {
    state: portalState({
      enabled: portal.enabled,
      opensAt: portal.opensAt,
      closesAt: portal.closesAt,
      dueAt: assignment.dueAt,
      allowLateSubmissions: portal.allowLateSubmissions,
      assignmentStatus: assignment.status,
    }),
    university: assignment.course.university,
    course: assignment.course.name,
    assignment: `Tarea ${assignment.number} — ${assignment.title}`,
    topic: assignment.topic,
    sections: assignment.sections.map((section) => section.name),
    dueAt: assignment.dueAt.toISOString(),
    instructions: portal.instructions || assignment.instructions,
    allowedMimeTypes: portal.allowedMimeTypes as string[],
    maxFileSize: portal.maxFileSize,
    allowLateSubmissions: portal.allowLateSubmissions,
    allowReplacements: portal.allowReplacements,
    members: eligibleMembers(portal).map((member) => ({
      reference: publicMemberReference(portal.id, member.id),
      name: member.fullName,
      alias: member.shortName,
    })),
  };
}

export function memberDeliveryDetails(
  portal: NonNullable<Awaited<ReturnType<typeof findPublicPortal>>>,
  memberId: string,
) {
  const assignment = portal.assignment;
  const member = assignment.course.members.find(
    (item) => item.id === memberId,
  )!;
  const sections = assignment.sections
    .map((section) => ({
      name: section.name,
      exercises: section.exercises
        .filter((exercise) =>
          exercise.allocations.some(
            (allocation) => allocation.memberId === memberId,
          ),
        )
        .map((exercise) => ({
          label: exercise.label,
          weight: exercise.weight,
        })),
    }))
    .filter((section) => section.exercises.length);
  const submission = assignment.submissions.find(
    (item) => item.memberId === memberId,
  );
  return {
    memberName: member.fullName,
    course: assignment.course.name,
    assignment: `Tarea ${assignment.number} — ${assignment.title}`,
    dueAt: assignment.dueAt.toISOString(),
    sections,
    total: sections.reduce((sum, section) => sum + section.exercises.length, 0),
    totalWeight: sections.reduce(
      (sum, section) =>
        sum +
        section.exercises.reduce(
          (subtotal, exercise) => subtotal + exercise.weight,
          0,
        ),
      0,
    ),
    previous: submission
      ? {
          status: submission.status,
          firstReceivedAt:
            submission.firstReceivedAt?.toISOString() ??
            submission.receivedAt?.toISOString() ??
            null,
          lastReceivedAt:
            submission.lastReceivedAt?.toISOString() ??
            submission.receivedAt?.toISOString() ??
            null,
          version: submission.versions[0]?.version ?? 0,
          reviewComment: submission.reviewComment,
        }
      : null,
    mayReplace:
      !submission ||
      portal.allowReplacements ||
      submission.status === "NEEDS_CORRECTION",
  };
}

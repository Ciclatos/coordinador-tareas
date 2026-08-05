"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  encryptPortalToken,
  generatePortalToken,
  hashPortalToken,
} from "@/lib/submission-portal";

const portalSchema = z.object({
  assignmentId: z.string().cuid(),
  enabled: z.boolean(),
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  allowLateSubmissions: z.boolean(),
  allowReplacements: z.boolean(),
  maxReplacements: z.number().int().min(0).max(20),
  maxFileSize: z
    .number()
    .int()
    .min(1024 * 1024)
    .max(250 * 1024 * 1024),
  allowedMimeTypes: z
    .array(z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]))
    .min(1),
  instructions: z.string().max(5000),
});

async function ownedAssignment(userId: string, assignmentId: string) {
  return prisma.assignment.findFirst({
    where: { id: assignmentId, course: { userId } },
    select: { id: true },
  });
}

export async function saveSubmissionPortal(
  input: z.input<typeof portalSchema>,
) {
  const { userId } = await requireSession();
  const data = portalSchema.parse(input);
  if (!(await ownedAssignment(userId, data.assignmentId)))
    throw new Error("Tarea no encontrada.");
  const previous = await prisma.assignmentSubmissionPortal.findUnique({
    where: { assignmentId: data.assignmentId },
  });
  const rawToken = previous ? null : generatePortalToken();
  const portal = await prisma.assignmentSubmissionPortal.upsert({
    where: { assignmentId: data.assignmentId },
    create: {
      assignmentId: data.assignmentId,
      tokenHash: hashPortalToken(rawToken!),
      tokenCipher: encryptPortalToken(rawToken!),
      enabled: data.enabled,
      opensAt: data.opensAt ? new Date(data.opensAt) : null,
      closesAt: data.closesAt ? new Date(data.closesAt) : null,
      allowLateSubmissions: data.allowLateSubmissions,
      allowReplacements: data.allowReplacements,
      maxReplacements: data.maxReplacements,
      maxFileSize: data.maxFileSize,
      allowedMimeTypes: data.allowedMimeTypes,
      instructions: data.instructions || null,
    },
    update: {
      enabled: data.enabled,
      opensAt: data.opensAt ? new Date(data.opensAt) : null,
      closesAt: data.closesAt ? new Date(data.closesAt) : null,
      allowLateSubmissions: data.allowLateSubmissions,
      allowReplacements: data.allowReplacements,
      maxReplacements: data.maxReplacements,
      maxFileSize: data.maxFileSize,
      allowedMimeTypes: data.allowedMimeTypes,
      instructions: data.instructions || null,
    },
  });
  const events = [previous ? "PORTAL_UPDATED" : "PORTAL_CREATED"];
  if (
    (!previous && data.enabled) ||
    (previous && previous.enabled !== data.enabled)
  )
    events.push(data.enabled ? "PORTAL_ACTIVATED" : "PORTAL_DISABLED");
  await prisma.submissionAuditEvent.createMany({
    data: events.map((eventType) => ({
      assignmentId: data.assignmentId,
      portalId: portal.id,
      eventType,
      metadata: { enabled: data.enabled },
    })),
  });
  revalidatePath("/app");
  return { ok: true };
}

export async function regenerateSubmissionPortal(assignmentId: string) {
  const { userId } = await requireSession();
  if (!(await ownedAssignment(userId, assignmentId)))
    throw new Error("Tarea no encontrada.");
  const rawToken = generatePortalToken();
  const portal = await prisma.assignmentSubmissionPortal.update({
    where: { assignmentId },
    data: {
      tokenHash: hashPortalToken(rawToken),
      tokenCipher: encryptPortalToken(rawToken),
      tokenVersion: { increment: 1 },
      revokedAt: null,
    },
  });
  await prisma.submissionAuditEvent.create({
    data: { assignmentId, portalId: portal.id, eventType: "TOKEN_REGENERATED" },
  });
  revalidatePath("/app");
  return { ok: true };
}

export async function reviewSubmission(input: {
  submissionId: string;
  status: "APPROVED" | "NEEDS_CORRECTION" | "REJECTED" | "REVIEWING";
  comment?: string;
}) {
  const { userId } = await requireSession();
  const submission = await prisma.submission.findFirst({
    where: { id: input.submissionId, assignment: { course: { userId } } },
    select: { id: true, assignmentId: true, memberId: true },
  });
  if (!submission) throw new Error("Entrega no encontrada.");
  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      status: input.status,
      reviewComment: input.comment?.trim() || null,
      approvedAt: input.status === "APPROVED" ? new Date() : null,
    },
  });
  await prisma.submissionAuditEvent.create({
    data: {
      assignmentId: submission.assignmentId,
      submissionId: submission.id,
      memberId: submission.memberId,
      eventType:
        input.status === "NEEDS_CORRECTION"
          ? "CORRECTION_REQUESTED"
          : `SUBMISSION_${input.status}`,
      metadata: input.comment ? { hasComment: true } : undefined,
    },
  });
  revalidatePath("/app");
  return { ok: true };
}

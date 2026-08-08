"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  createPortalCredentials,
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
  // Prisma evalúa también el objeto `create` de un upsert que terminará en
  // `update`. El token debe ser siempre válido aunque el portal ya exista.
  const credentials = createPortalCredentials();
  const portal = await prisma.assignmentSubmissionPortal.upsert({
    where: { assignmentId: data.assignmentId },
    create: {
      assignmentId: data.assignmentId,
      tokenHash: credentials.tokenHash,
      tokenCipher: credentials.tokenCipher,
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
  const parsed = z
    .object({
      submissionId: z.string().cuid(),
      status: z.enum(["APPROVED", "NEEDS_CORRECTION", "REJECTED", "REVIEWING"]),
      comment: z.string().trim().min(3).max(2000).optional(),
    })
    .superRefine((value, context) => {
      if (
        ["NEEDS_CORRECTION", "REJECTED"].includes(value.status) &&
        !value.comment
      )
        context.addIssue({
          code: "custom",
          path: ["comment"],
          message: "Escriba un motivo antes de continuar.",
        });
    })
    .parse(input);
  const { userId } = await requireSession();
  const submission = await prisma.submission.findFirst({
    where: { id: parsed.submissionId, assignment: { course: { userId } } },
    select: { id: true, assignmentId: true, memberId: true },
  });
  if (!submission) throw new Error("Entrega no encontrada.");
  await prisma.$transaction([
    prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: parsed.status,
        reviewComment: parsed.comment || null,
        approvedAt: parsed.status === "APPROVED" ? new Date() : null,
      },
    }),
    prisma.assignment.update({
      where: { id: submission.assignmentId },
      data: { contentUpdatedAt: new Date() },
    }),
  ]);
  await prisma.submissionAuditEvent.create({
    data: {
      assignmentId: submission.assignmentId,
      submissionId: submission.id,
      memberId: submission.memberId,
      eventType:
        parsed.status === "NEEDS_CORRECTION"
          ? "CORRECTION_REQUESTED"
          : `SUBMISSION_${parsed.status}`,
      metadata: parsed.comment ? { hasComment: true } : undefined,
    },
  });
  revalidatePath("/app");
  return {
    ok: true,
    message:
      parsed.status === "APPROVED"
        ? "Entrega aprobada correctamente."
        : parsed.status === "NEEDS_CORRECTION"
          ? "Solicitud de corrección enviada."
          : parsed.status === "REJECTED"
            ? "Entrega rechazada."
            : "Entrega actualizada.",
  };
}

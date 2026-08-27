import "server-only";
import { del, get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { inspectSubmissionStream } from "@/lib/submission-files";
import {
  allowedExtension,
  createReceiptCode,
  portalAcceptsPublicSession,
  portalState,
} from "@/lib/submission-portal";
import { submissionPath } from "@/lib/submission-path";

export type PublicSubmissionFinalizeInput = {
  portalId: string;
  assignmentId: string;
  memberId: string;
  tokenVersion: number;
  idempotencyKey: string;
  uploadId: string;
  pathname: string;
  originalName: string;
};

export class PublicSubmissionFinalizeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function finalizePublicSubmission(
  input: PublicSubmissionFinalizeInput,
) {
  const existing = await prisma.submissionVersion.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: {
      version: true,
      receiptCode: true,
      files: { select: { originalName: true, pageCount: true } },
      submission: { select: { late: true } },
    },
  });
  if (existing)
    return {
      ok: true,
      version: existing.version,
      receiptCode: existing.receiptCode,
      fileName: existing.files[0]?.originalName,
      pageCount: existing.files[0]?.pageCount,
      late: existing.submission.late,
    };

  const portal = await prisma.assignmentSubmissionPortal.findUnique({
    where: { id: input.portalId },
    include: {
      assignment: {
        include: {
          course: { include: { members: { where: { id: input.memberId } } } },
          exclusions: true,
          allocations: {
            where: { memberId: input.memberId },
            include: { exercise: { include: { section: true } } },
          },
          submissions: {
            where: { memberId: input.memberId },
            include: { _count: { select: { versions: true } } },
          },
        },
      },
    },
  });
  const session = {
    tokenVersion: input.tokenVersion,
    assignmentId: input.assignmentId,
    memberId: input.memberId,
  };
  if (
    !portal ||
    !portalAcceptsPublicSession({
      enabled: portal.enabled,
      tokenVersion: portal.tokenVersion,
      assignmentId: portal.assignmentId,
      session,
      activeMemberIds: portal.assignment.course.members
        .filter((member) => member.active)
        .map((member) => member.id),
      excludedMemberIds: portal.assignment.exclusions.map(
        (item) => item.memberId,
      ),
    })
  )
    throw new PublicSubmissionFinalizeError(
      "La sesión o el portal ya no son válidos.",
      403,
    );

  const state = portalState({
    enabled: portal.enabled,
    opensAt: portal.opensAt,
    closesAt: portal.closesAt,
    dueAt: portal.assignment.dueAt,
    allowLateSubmissions: portal.allowLateSubmissions,
    assignmentStatus: portal.assignment.status,
  });
  if (!["OPEN", "DUE_SOON", "LATE_ALLOWED"].includes(state))
    throw new PublicSubmissionFinalizeError(
      "El portal está cerrado para entregas.",
      403,
    );

  const previous = portal.assignment.submissions[0];
  if (
    previous &&
    previous.status !== "NEEDS_CORRECTION" &&
    (!portal.allowReplacements ||
      previous._count.versions - 1 >= portal.maxReplacements)
  )
    throw new PublicSubmissionFinalizeError(
      "No se permiten más reemplazos para esta entrega.",
      409,
    );

  const expected = submissionPath("public", input.uploadId, input.originalName);
  if (input.pathname !== expected)
    throw new PublicSubmissionFinalizeError(
      "La ruta del archivo no es válida.",
      400,
    );

  let details: Awaited<ReturnType<typeof inspectSubmissionStream>>;
  try {
    const blob = await get(input.pathname, { access: "private", useCache: false });
    if (!blob || blob.statusCode !== 200)
      throw new Error("No se encontró el archivo cargado.");
    if (blob.blob.size > portal.maxFileSize)
      throw new Error(
        `El archivo supera el límite de ${Math.round(portal.maxFileSize / 1024 / 1024)} MB.`,
      );
    details = await inspectSubmissionStream(blob.stream, portal.maxFileSize);
    if (!(portal.allowedMimeTypes as string[]).includes(details.mimeType))
      throw new Error("El tipo real del archivo no está permitido.");
    const extension = input.originalName.toLowerCase().split(".").pop();
    const expectedExtension = allowedExtension(details.mimeType);
    if (
      !extension ||
      (details.mimeType === "image/jpeg"
        ? !["jpg", "jpeg"].includes(extension)
        : extension !== expectedExtension)
    )
      throw new Error(
        "La extensión no coincide con el contenido real del archivo.",
      );
  } catch (error) {
    await del(input.pathname).catch(() => undefined);
    throw new PublicSubmissionFinalizeError(
      error instanceof Error ? error.message : "Archivo inválido.",
      400,
    );
  }

  const now = new Date();
  const firstLate = previous ? previous.late : now > portal.assignment.dueAt;
  const minutesLate = previous
    ? undefined
    : Math.max(
        0,
        Math.ceil((now.getTime() - portal.assignment.dueAt.getTime()) / 60000),
      );
  const member = portal.assignment.course.members[0];
  const receiptCode = createReceiptCode(
    portal.assignment.course.code || portal.assignment.course.name,
    portal.assignment.number,
    member.fullName,
  );
  const snapshot = portal.assignment.allocations.map((allocation) => ({
    section: allocation.exercise.section.name,
    exercise: allocation.exercise.label,
    weight: allocation.exercise.weight,
  }));

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const submission = await tx.submission.upsert({
          where: {
            assignmentId_memberId: {
              assignmentId: input.assignmentId,
              memberId: input.memberId,
            },
          },
          create: {
            assignmentId: input.assignmentId,
            memberId: input.memberId,
            status: "REVIEWING",
            origin: "PORTAL",
            receivedAt: now,
            firstReceivedAt: now,
            lastReceivedAt: now,
            late: firstLate,
            minutesLate: minutesLate ?? 0,
          },
          update: {
            status: "REVIEWING",
            receivedAt: now,
            lastReceivedAt: now,
            origin: "PORTAL",
          },
        });
        const latest = await tx.submissionVersion.aggregate({
          where: { submissionId: submission.id },
          _max: { version: true },
        });
        const version = await tx.submissionVersion.create({
          data: {
            submissionId: submission.id,
            version: (latest._max.version ?? 0) + 1,
            idempotencyKey: input.idempotencyKey,
            receiptCode,
            assignmentSnapshot: snapshot,
            files: {
              create: {
                storageKey: input.pathname,
                originalName: input.originalName,
                mimeType: details.mimeType,
                kind: details.mimeType === "application/pdf" ? "PDF" : "IMAGE",
                sizeBytes: details.size,
                pageCount: details.pageCount,
                sha256: details.sha256,
              },
            },
          },
          select: { version: true },
        });
        await tx.assignment.update({
          where: { id: input.assignmentId },
          data: { status: "RECEIVING", contentUpdatedAt: new Date() },
        });
        await tx.submissionAuditEvent.create({
          data: {
            assignmentId: input.assignmentId,
            portalId: portal.id,
            memberId: input.memberId,
            submissionId: submission.id,
            eventType: previous
              ? "SUBMISSION_REPLACED"
              : "SUBMISSION_COMPLETED",
            metadata: {
              version: version.version,
              pages: details.pageCount,
              size: details.size,
            },
          },
        });
        return version;
      },
      { maxWait: 10_000, timeout: 45_000 },
    );
    return {
      ok: true,
      version: result.version,
      receiptCode,
      fileName: input.originalName,
      pageCount: details.pageCount,
      late: firstLate,
      receivedAt: now.toISOString(),
    };
  } catch (error) {
    const duplicate = await prisma.submissionVersion.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: {
        version: true,
        receiptCode: true,
        files: { select: { originalName: true, pageCount: true } },
        submission: { select: { late: true } },
      },
    });
    if (duplicate)
      return {
        ok: true,
        version: duplicate.version,
        receiptCode: duplicate.receiptCode,
        fileName: duplicate.files[0]?.originalName,
        pageCount: duplicate.files[0]?.pageCount,
        late: duplicate.submission.late,
      };
    console.error("[public-submission-finalizer] No se pudo registrar", {
      assignmentId: input.assignmentId,
      memberId: input.memberId,
      error: error instanceof Error ? error.message : String(error),
    });
    await prisma.submissionAuditEvent
      .create({
        data: {
          assignmentId: input.assignmentId,
          portalId: portal.id,
          memberId: input.memberId,
          eventType: "SUBMISSION_FAILED",
          metadata: { stage: "database" },
        },
      })
      .catch(() => undefined);
    throw new PublicSubmissionFinalizeError(
      "No se pudo registrar la entrega. Inténtelo nuevamente.",
      500,
    );
  }
}

import { del, get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getPublicSubmissionSession,
  validCsrf,
} from "@/lib/public-submission-session";
import { inspectSubmissionStream } from "@/lib/submission-files";
import { submissionPath } from "@/lib/submission-path";
import {
  allowedExtension,
  createReceiptCode,
  portalAcceptsPublicSession,
  portalState,
} from "@/lib/submission-portal";

export const runtime = "nodejs";
export const maxDuration = 60;
const schema = z.object({
  csrf: z.string(),
  idempotencyKey: z.string().uuid(),
  uploadId: z.string().uuid(),
  pathname: z.string().min(1).max(500),
  originalName: z.string().min(1).max(255),
  confirmed: z.literal(true),
});

export async function POST(request: Request) {
  const session = await getPublicSubmissionSession();
  if (!session)
    return NextResponse.json(
      { error: "La sesión expiró. Confirme su identidad nuevamente." },
      { status: 401 },
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !validCsrf(session, parsed.data.csrf))
    return NextResponse.json(
      { error: "Confirmación inválida." },
      { status: 400 },
    );
  const existing = await prisma.submissionVersion.findUnique({
    where: { idempotencyKey: parsed.data.idempotencyKey },
    select: {
      version: true,
      receiptCode: true,
      files: { select: { originalName: true, pageCount: true } },
      submission: { select: { late: true } },
    },
  });
  if (existing)
    return NextResponse.json({
      ok: true,
      version: existing.version,
      receiptCode: existing.receiptCode,
      fileName: existing.files[0]?.originalName,
      pageCount: existing.files[0]?.pageCount,
      late: existing.submission.late,
    });
  const portal = await prisma.assignmentSubmissionPortal.findUnique({
    where: { id: session.portalId },
    include: {
      assignment: {
        include: {
          course: { include: { members: { where: { id: session.memberId } } } },
          exclusions: true,
          allocations: {
            where: { memberId: session.memberId },
            include: { exercise: { include: { section: true } } },
          },
          submissions: {
            where: { memberId: session.memberId },
            include: { _count: { select: { versions: true } } },
          },
        },
      },
    },
  });
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
      allocatedMemberIds: portal.assignment.allocations.map(
        (item) => item.memberId,
      ),
    })
  )
    return NextResponse.json(
      { error: "La sesión o el portal ya no son válidos." },
      { status: 403 },
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
    return NextResponse.json(
      { error: "El portal está cerrado para entregas." },
      { status: 403 },
    );
  const previous = portal.assignment.submissions[0];
  if (
    previous &&
    previous.status !== "NEEDS_CORRECTION" &&
    (!portal.allowReplacements ||
      previous._count.versions - 1 >= portal.maxReplacements)
  )
    return NextResponse.json(
      { error: "No se permiten más reemplazos para esta entrega." },
      { status: 409 },
    );
  const expected = submissionPath(
    "public",
    parsed.data.uploadId,
    parsed.data.originalName,
  );
  const directory = expected.slice(0, expected.lastIndexOf("/") + 1);
  if (
    !parsed.data.pathname.startsWith(directory) ||
    parsed.data.pathname.slice(directory.length).includes("/")
  )
    return NextResponse.json(
      { error: "La ruta del archivo no es válida." },
      { status: 400 },
    );
  let details: Awaited<ReturnType<typeof inspectSubmissionStream>>;
  try {
    const blob = await get(parsed.data.pathname, {
      access: "private",
      useCache: false,
    });
    if (!blob || blob.statusCode !== 200)
      throw new Error("No se encontró el archivo cargado.");
    if (blob.blob.size > portal.maxFileSize)
      throw new Error(
        `El archivo supera el límite de ${Math.round(portal.maxFileSize / 1024 / 1024)} MB.`,
      );
    details = await inspectSubmissionStream(blob.stream, portal.maxFileSize);
    if (!(portal.allowedMimeTypes as string[]).includes(details.mimeType))
      throw new Error("El tipo real del archivo no está permitido.");
    const extension = parsed.data.originalName.toLowerCase().split(".").pop();
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
    await del(parsed.data.pathname).catch(() => undefined);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Archivo inválido." },
      { status: 400 },
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
    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.submission.upsert({
        where: {
          assignmentId_memberId: {
            assignmentId: session.assignmentId,
            memberId: session.memberId,
          },
        },
        create: {
          assignmentId: session.assignmentId,
          memberId: session.memberId,
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
          idempotencyKey: parsed.data.idempotencyKey,
          receiptCode,
          assignmentSnapshot: snapshot,
          files: {
            create: {
              storageKey: parsed.data.pathname,
              originalName: parsed.data.originalName,
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
        where: { id: session.assignmentId },
        data: { status: "RECEIVING", contentUpdatedAt: new Date() },
      });
      await tx.submissionAuditEvent.create({
        data: {
          assignmentId: session.assignmentId,
          portalId: portal.id,
          memberId: session.memberId,
          submissionId: submission.id,
          eventType: previous ? "SUBMISSION_REPLACED" : "SUBMISSION_COMPLETED",
          metadata: {
            version: version.version,
            pages: details.pageCount,
            size: details.size,
          },
        },
      });
      return version;
    });
    return NextResponse.json({
      ok: true,
      version: result.version,
      receiptCode,
      fileName: parsed.data.originalName,
      pageCount: details.pageCount,
      late: firstLate,
      receivedAt: now.toISOString(),
    });
  } catch {
    const duplicate = await prisma.submissionVersion.findUnique({
      where: { idempotencyKey: parsed.data.idempotencyKey },
      select: { version: true, receiptCode: true },
    });
    if (duplicate)
      return NextResponse.json({
        ok: true,
        version: duplicate.version,
        receiptCode: duplicate.receiptCode,
        fileName: parsed.data.originalName,
        pageCount: details.pageCount,
        late: firstLate,
      });
    await del(parsed.data.pathname).catch(() => undefined);
    return NextResponse.json(
      { error: "No se pudo registrar la entrega. Inténtelo nuevamente." },
      { status: 500 },
    );
  }
}

import { del, get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  inspectSubmissionStream,
  MAX_SUBMISSION_FILE_SIZE,
} from "@/lib/submission-files";
import { submissionPath } from "@/lib/submission-path";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  assignmentId: z.string().cuid(),
  memberId: z.string().cuid(),
  uploadId: z.string().uuid(),
  files: z
    .array(
      z.object({
        pathname: z.string().min(1).max(500),
        originalName: z.string().min(1).max(255),
        exerciseId: z.string().cuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Datos de entrega inválidos." }, { status: 400 });
  const { assignmentId, memberId, uploadId, files } = parsed.data;
  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      course: { userId: session.userId, members: { some: { id: memberId } } },
    },
    select: {
      id: true,
      dueAt: true,
      sections: { select: { exercises: { select: { id: true } } } },
    },
  });
  if (!assignment)
    return NextResponse.json({ error: "No tienes acceso a esta tarea." }, { status: 403 });
  const exerciseIds = new Set(
    assignment.sections.flatMap((section) => section.exercises.map((item) => item.id)),
  );
  if (files.some((file) => file.exerciseId && !exerciseIds.has(file.exerciseId)))
    return NextResponse.json({ error: "Un ejercicio no pertenece a la tarea." }, { status: 400 });

  const inspected: Array<{
    pathname: string;
    originalName: string;
    exerciseId?: string | null;
    mimeType: string;
    size: number;
    sha256: string;
  }> = [];
  try {
    for (const file of files) {
      const expected = submissionPath(assignmentId, uploadId, file.originalName);
      const directory = expected.slice(0, expected.lastIndexOf("/") + 1);
      const relativeName = file.pathname.slice(directory.length);
      if (
        !file.pathname.startsWith(directory) ||
        !relativeName ||
        relativeName.includes("/")
      )
        throw new Error("La ruta de un archivo no coincide con la entrega.");
      const blob = await get(file.pathname, { access: "private", useCache: false });
      if (!blob || blob.statusCode !== 200) throw new Error("No se encontró un archivo cargado.");
      if (blob.blob.size > MAX_SUBMISSION_FILE_SIZE)
        throw new Error("Un archivo supera el límite de 25 MB.");
      const details = await inspectSubmissionStream(blob.stream);
      if (details.size !== blob.blob.size)
        throw new Error("El archivo cargado está incompleto.");
      inspected.push({ ...file, ...details });
    }
  } catch (error) {
    await Promise.allSettled(files.map((file) => del(file.pathname)));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Archivo inválido." },
      { status: 400 },
    );
  }

  const now = new Date();
  const late = now > assignment.dueAt;
  const result = await prisma.$transaction(async (tx) => {
    const submission = await tx.submission.upsert({
      where: { assignmentId_memberId: { assignmentId, memberId } },
      update: { status: late ? "LATE" : "SUBMITTED", receivedAt: now, late },
      create: {
        assignmentId,
        memberId,
        status: late ? "LATE" : "SUBMITTED",
        receivedAt: now,
        late,
      },
      select: { id: true },
    });
    const latest = await tx.submissionVersion.aggregate({
      where: { submissionId: submission.id },
      _max: { version: true },
    });
    const version = await tx.submissionVersion.create({
      data: {
        submissionId: submission.id,
        version: (latest._max.version ?? 0) + 1,
        files: {
          create: inspected.map((file, sortOrder) => ({
            exerciseId: file.exerciseId || null,
            storageKey: file.pathname,
            originalName: file.originalName,
            mimeType: file.mimeType,
            kind: file.mimeType === "application/pdf" ? "PDF" : "IMAGE",
            sizeBytes: file.size,
            sortOrder,
            sha256: file.sha256,
          })),
        },
      },
      select: { id: true, version: true },
    });
    await tx.assignment.update({ where: { id: assignmentId }, data: { status: "RECEIVING" } });
    return version;
  });
  return NextResponse.json({ ok: true, version: result.version });
}

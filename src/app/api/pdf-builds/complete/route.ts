import { del, get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { inspectSubmissionStream, MAX_PDF_BUILD_FILE_SIZE } from "@/lib/submission-files";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  assignmentId: z.string().cuid(),
  uploadId: z.string().uuid(),
  pathname: z.string().min(1).max(500),
  contentSnapshotAt: z.string().datetime(),
  items: z.array(z.object({
    kind: z.string().min(1).max(30),
    sourceId: z.string().cuid().nullable().optional(),
    rotation: z.number().int().min(0).max(270).default(0),
    selectedPages: z.array(z.number().int().min(0).max(999)).optional(),
  })).max(220),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos de compilación inválidos." }, { status: 400 });
  const expected = `pdf-builds/${parsed.data.assignmentId}/${parsed.data.uploadId}.pdf`;
  if (parsed.data.pathname !== expected)
    return NextResponse.json({ error: "Ruta de compilación inválida." }, { status: 400 });
  const assignment = await prisma.assignment.findFirst({
    where: { id: parsed.data.assignmentId, course: { userId: session.userId } },
    select: { id: true },
  });
  if (!assignment) return NextResponse.json({ error: "No tienes acceso a esta tarea." }, { status: 403 });
  try {
    const blob = await get(expected, { access: "private", useCache: false });
    if (!blob || blob.statusCode !== 200) throw new Error("No se encontró el PDF generado.");
    if (blob.blob.size > MAX_PDF_BUILD_FILE_SIZE)
      throw new Error("El PDF final supera el límite de 250 MB.");
    const details = await inspectSubmissionStream(blob.stream, MAX_PDF_BUILD_FILE_SIZE);
    if (details.mimeType !== "application/pdf" || details.size !== blob.blob.size)
      throw new Error("El archivo final no es un PDF válido.");
    const latest = await prisma.pdfBuild.aggregate({
      where: { assignmentId: assignment.id }, _max: { version: true },
    });
    const build = await prisma.pdfBuild.create({
      data: {
        assignmentId: assignment.id,
        version: (latest._max.version ?? 0) + 1,
        status: "READY",
        storageKey: expected,
        sizeBytes: details.size,
        contentSnapshotAt: new Date(parsed.data.contentSnapshotAt),
        items: { create: parsed.data.items.map((item, sortOrder) => ({ ...item, sortOrder })) },
      },
      select: { id: true, version: true },
    });
    await prisma.assignment.update({ where: { id: assignment.id }, data: { status: "FINALIZED" } });
    return NextResponse.json({ ok: true, build });
  } catch (error) {
    await del(expected).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el PDF." }, { status: 400 });
  }
}

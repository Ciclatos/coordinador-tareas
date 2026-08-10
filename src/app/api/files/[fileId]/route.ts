import { del, get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { sanitizeFileName } from "@/lib/submission-path";

export const runtime = "nodejs";

async function authorizedFile(fileId: string, userId: string) {
  return prisma.submissionFile.findFirst({
    where: {
      id: fileId,
      version: { submission: { assignment: { course: { userId } } } },
    },
    select: {
      id: true,
      storageKey: true,
      originalName: true,
      mimeType: true,
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { fileId } = await context.params;
  const file = await authorizedFile(fileId, session.userId);
  if (!file)
    return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  if (!file.storageKey)
    return NextResponse.json(
      { error: "Esta entrega fue consolidada en el PDF final." },
      { status: 410 },
    );
  const blob = await get(file.storageKey, { access: "private" });
  if (!blob || blob.statusCode !== 200)
    return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });
  return new Response(blob.stream, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(blob.blob.size),
      "Content-Disposition": `inline; filename="${sanitizeFileName(file.originalName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { fileId } = await context.params;
  const file = await authorizedFile(fileId, session.userId);
  if (!file)
    return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  if (file.storageKey) await del(file.storageKey);
  await prisma.submissionFile.delete({ where: { id: file.id } });
  return NextResponse.json({ ok: true });
}

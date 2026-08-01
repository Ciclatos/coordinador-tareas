import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ buildId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { buildId } = await context.params;
  const build = await prisma.pdfBuild.findFirst({
    where: { id: buildId, status: "READY", assignment: { course: { userId: session.userId } } },
    select: { storageKey: true, version: true, assignment: { select: { number: true } } },
  });
  if (!build?.storageKey) return NextResponse.json({ error: "Versión no encontrada." }, { status: 404 });
  const blob = await get(build.storageKey, { access: "private", useCache: false });
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: "PDF no disponible." }, { status: 404 });
  return new Response(blob.stream, { headers: {
    "Content-Type": "application/pdf",
    "Content-Length": String(blob.blob.size),
    "Content-Disposition": `attachment; filename="tarea-${build.assignment.number}-version-${build.version}.pdf"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}

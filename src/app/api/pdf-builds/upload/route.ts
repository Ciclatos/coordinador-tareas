import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { MAX_SUBMISSION_FILE_SIZE } from "@/lib/submission-files";

export const runtime = "nodejs";

const payloadSchema = z.object({
  assignmentId: z.string().cuid(),
  uploadId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  let body: HandleUploadBody;
  try { body = (await request.json()) as HandleUploadBody; }
  catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
  try {
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const parsed = payloadSchema.safeParse(clientPayload ? JSON.parse(clientPayload) : null);
        if (!parsed.success) throw new Error("Metadatos de compilación inválidos.");
        const expected = `pdf-builds/${parsed.data.assignmentId}/${parsed.data.uploadId}.pdf`;
        if (pathname !== expected) throw new Error("Ruta de compilación inválida.");
        const assignment = await prisma.assignment.findFirst({
          where: { id: parsed.data.assignmentId, course: { userId: session.userId } },
          select: { id: true },
        });
        if (!assignment) throw new Error("No tienes acceso a esta tarea.");
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_SUBMISSION_FILE_SIZE,
          addRandomSuffix: false,
          cacheControlMaxAge: 60,
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cargar." }, { status: 400 });
  }
}

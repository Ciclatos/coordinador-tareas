import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  ALLOWED_SUBMISSION_TYPES,
  MAX_SUBMISSION_FILE_SIZE,
} from "@/lib/submission-files";
import { submissionPath } from "@/lib/submission-path";
import { logStorageError, publicUploadError } from "@/lib/storage-errors";

export const runtime = "nodejs";

const payloadSchema = z.object({
  assignmentId: z.string().cuid(),
  memberId: z.string().cuid(),
  exerciseId: z.string().cuid().nullable().optional(),
  uploadId: z.string().uuid(),
  originalName: z.string().min(1).max(255),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  try {
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const parsed = payloadSchema.safeParse(
          clientPayload ? JSON.parse(clientPayload) : null,
        );
        if (!parsed.success) throw new Error("Metadatos de carga inválidos.");
        const { assignmentId, memberId, exerciseId, uploadId, originalName } =
          parsed.data;
        if (pathname !== submissionPath(assignmentId, uploadId, originalName))
          throw new Error("La ruta del archivo no es válida.");
        const assignment = await prisma.assignment.findFirst({
          where: {
            id: assignmentId,
            course: {
              userId: session.userId,
              members: { some: { id: memberId, active: true } },
            },
          },
          select: {
            id: true,
            sections: {
              where: exerciseId
                ? { exercises: { some: { id: exerciseId } } }
                : undefined,
              select: { id: true },
            },
          },
        });
        if (!assignment || (exerciseId && assignment.sections.length === 0))
          throw new Error("No tienes acceso a esta entrega.");
        return {
          allowedContentTypes: [...ALLOWED_SUBMISSION_TYPES],
          maximumSizeInBytes: MAX_SUBMISSION_FILE_SIZE,
          addRandomSuffix: true,
          cacheControlMaxAge: 60,
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    logStorageError("coordinator-submission-upload", error);
    return NextResponse.json(
      { error: publicUploadError(error, "No se pudo cargar el archivo.") },
      { status: 400 },
    );
  }
}

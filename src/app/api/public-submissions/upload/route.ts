import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getPublicSubmissionSession,
  validCsrf,
} from "@/lib/public-submission-session";
import { submissionPath } from "@/lib/submission-path";
import { portalAcceptsPublicSession } from "@/lib/submission-portal";
import { logStorageError, publicUploadError } from "@/lib/storage-errors";

export const runtime = "nodejs";
const payloadSchema = z.object({
  csrf: z.string(),
  uploadId: z.string().uuid(),
  originalName: z.string().min(1).max(255),
});

export async function POST(request: Request) {
  const session = await getPublicSubmissionSession();
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (!session)
    return NextResponse.json(
      { error: "La sesión expiró. Confirme su identidad nuevamente." },
      { status: 401 },
    );
  try {
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const parsed = payloadSchema.safeParse(
          clientPayload ? JSON.parse(clientPayload) : null,
        );
        if (!parsed.success || !validCsrf(session, parsed.data.csrf))
          throw new Error("La sesión de entrega no es válida.");
        const portal = await prisma.assignmentSubmissionPortal.findUnique({
          where: { id: session.portalId },
          include: {
            assignment: {
              include: {
                course: {
                  include: {
                    members: { where: { id: session.memberId } },
                  },
                },
                exclusions: true,
                allocations: true,
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
          throw new Error("La sesión de entrega ya no es válida.");
        const previous = portal.assignment.submissions[0];
        if (
          previous &&
          previous.status !== "NEEDS_CORRECTION" &&
          (!portal.allowReplacements ||
            previous._count.versions - 1 >= portal.maxReplacements)
        )
          throw new Error("No se permiten más reemplazos para esta entrega.");
        if (
          pathname !==
          submissionPath(
            "public",
            parsed.data.uploadId,
            parsed.data.originalName,
          )
        )
          throw new Error("La ruta del archivo no es válida.");
        return {
          allowedContentTypes: portal.allowedMimeTypes as string[],
          maximumSizeInBytes: portal.maxFileSize,
          addRandomSuffix: true,
          cacheControlMaxAge: 60,
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    logStorageError("public-submission-upload", error);
    return NextResponse.json(
      {
        error: publicUploadError(error, "No se pudo iniciar la carga."),
      },
      { status: 400 },
    );
  }
}

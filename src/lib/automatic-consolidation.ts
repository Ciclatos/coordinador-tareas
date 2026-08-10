import "server-only";
import { prisma } from "@/lib/prisma";
import { autoConsolidationDue, checkConsolidation } from "@/lib/consolidation";
import { deleteBlobKeysWithRetry } from "@/lib/blob-cleanup";

export async function runDueConsolidations(now = new Date()) {
  const candidates = await prisma.assignment.findMany({
    where: { status: "FINALIZED", autoConsolidateDays: { in: [7, 14, 30] }, finalizedAt: { not: null } },
    select: {
      id: true, contentUpdatedAt: true, finalizedAt: true, autoConsolidateDays: true,
      course: { select: { members: { where: { active: true }, select: { id: true } } } },
      exclusions: { select: { memberId: true } },
      submissions: { select: { status: true, versions: { orderBy: { version: "desc" }, select: { files: { select: { id: true, storageKey: true, sizeBytes: true } } } } } },
      pdfBuilds: { where: { status: "READY", storageKey: { not: null } }, orderBy: { version: "desc" }, take: 1, select: { id: true, status: true, storageKey: true, contentSnapshotAt: true, items: { where: { kind: "SUBMISSION_FILE" }, select: { sourceId: true } } } },
    },
  });
  let consolidatedCount = 0;
  let reclaimedBytes = 0;
  for (const assignment of candidates) {
    if (!autoConsolidationDue(assignment.finalizedAt, assignment.autoConsolidateDays, now)) continue;
    const excluded = new Set(assignment.exclusions.map((item) => item.memberId));
    const participantCount = assignment.course.members.filter((member) => !excluded.has(member.id)).length;
    const delivered = assignment.submissions.filter((submission) => submission.status !== "PENDING").length;
    const files = assignment.submissions.flatMap((submission) => submission.versions.flatMap((version, index) => version.files.map((file) => ({ ...file, isCurrent: index === 0 }))));
    const build = assignment.pdfBuilds[0] ?? null;
    const check = checkConsolidation({
      status: "FINALIZED", contentUpdatedAt: assignment.contentUpdatedAt,
      pendingCount: Math.max(0, participantCount - delivered),
      correctionCount: assignment.submissions.filter((submission) => submission.status === "NEEDS_CORRECTION").length,
      incompleteUploadCount: 0, files,
      latestBuild: build ? { id: build.id, status: build.status, storageKey: build.storageKey, contentSnapshotAt: build.contentSnapshotAt, sourceIds: build.items.flatMap((item) => item.sourceId ? [item.sourceId] : []) } : null,
    });
    if (!check.eligible) continue;
    await prisma.$transaction([
      prisma.submissionFile.updateMany({ where: { id: { in: files.map((file) => file.id) } }, data: { storageKey: null, binaryDeletedAt: now } }),
      prisma.assignment.update({ where: { id: assignment.id }, data: { status: "CONSOLIDATED", consolidatedAt: now, consolidatedBytes: check.reclaimableBytes } }),
      prisma.submissionAuditEvent.create({ data: { assignmentId: assignment.id, eventType: "TASK_AUTO_CONSOLIDATED", metadata: { fileCount: check.fileCount, reclaimedBytes: check.reclaimableBytes } } }),
    ]);
    if (check.storageKeys.length)
      await deleteBlobKeysWithRetry(check.storageKeys).catch((error) => console.error("automatic_consolidation_blob_cleanup_failed", { assignmentId: assignment.id, error }));
    consolidatedCount += 1;
    reclaimedBytes += check.reclaimableBytes;
  }
  return { consolidatedCount, reclaimedBytes };
}

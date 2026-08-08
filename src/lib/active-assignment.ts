export type AssignmentChoice = { id: string; status: string };

export function resolveActiveAssignment<T extends AssignmentChoice>(
  assignments: T[],
  requestedId?: string | null,
  preferredId?: string | null,
) {
  return (
    assignments.find((item) => item.id === requestedId) ??
    assignments.find((item) => item.id === preferredId) ??
    assignments.find((item) => item.status !== "ARCHIVED") ??
    assignments[0]
  );
}

export function isPdfBuildStale(
  contentUpdatedAt?: string | null,
  build?: { createdAt: string; contentSnapshotAt?: string | null } | null,
) {
  if (!contentUpdatedAt || !build) return false;
  const snapshot = build.contentSnapshotAt ?? build.createdAt;
  return new Date(contentUpdatedAt).getTime() > new Date(snapshot).getTime();
}

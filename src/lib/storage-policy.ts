export const STORAGE_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export function isPastStorageGrace(uploadedAt: Date | string, now = Date.now()) {
  return now - new Date(uploadedAt).getTime() >= STORAGE_ORPHAN_GRACE_MS;
}

export function storageLevel(percent: number) {
  if (percent >= 90) return "critical" as const;
  if (percent >= 75) return "warning" as const;
  return "normal" as const;
}

export function supersededBuilds<T extends { version: number }>(
  builds: T[],
  retention: number,
) {
  return [...builds].sort((a, b) => b.version - a.version).slice(Math.max(1, retention));
}

export function sanitizeFileName(name: string) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 120);
  return normalized || "archivo";
}

export function submissionPath(
  assignmentId: string,
  uploadId: string,
  originalName: string,
) {
  return `submissions/${assignmentId}/${uploadId}/${sanitizeFileName(originalName)}`;
}

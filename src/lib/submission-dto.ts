export function submissionDataIssue(input: {
  status: string;
  versionCount: number;
  currentVersion?: { files: unknown[] };
}) {
  if (input.versionCount > 0 && !input.currentVersion)
    return "No se encontró una versión actual para esta entrega.";
  if (input.versionCount === 0 && input.status !== "PENDING")
    return "La entrega no tiene archivos versionados.";
  if (input.currentVersion && input.currentVersion.files.length === 0)
    return "La versión actual no contiene archivos.";
  return null;
}

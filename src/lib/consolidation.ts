export type ConsolidationFile = {
  id: string;
  storageKey: string | null;
  sizeBytes: number;
  isCurrent: boolean;
};

export type ConsolidationBuild = {
  id: string;
  status: string;
  storageKey: string | null;
  contentSnapshotAt: Date | string | null;
  sourceIds: string[];
};

export type ConsolidationInput = {
  status: string;
  contentUpdatedAt: Date | string;
  pendingCount: number;
  correctionCount: number;
  incompleteUploadCount: number;
  files: ConsolidationFile[];
  latestBuild: ConsolidationBuild | null;
};

export type ConsolidationCheck = {
  eligible: boolean;
  reasons: string[];
  fileCount: number;
  historicalFileCount: number;
  reclaimableBytes: number;
  storageKeys: string[];
};

export function checkConsolidation(input: ConsolidationInput): ConsolidationCheck {
  const reasons: string[] = [];
  const build = input.latestBuild;
  if (!build || build.status !== "READY" || !build.storageKey)
    reasons.push("No existe un PDF final disponible.");
  if (input.pendingCount > 0)
    reasons.push("Aún existen entregas pendientes.");
  if (input.correctionCount > 0)
    reasons.push("Aún existen entregas en corrección.");
  if (input.incompleteUploadCount > 0)
    reasons.push("Existen cargas incompletas.");
  if (build?.contentSnapshotAt && new Date(build.contentSnapshotAt) < new Date(input.contentUpdatedAt))
    reasons.push("El PDF final está desactualizado.");

  const currentSourceIds = new Set(
    input.files.filter((file) => file.isCurrent && file.storageKey).map((file) => file.id),
  );
  const includedSourceIds = new Set(build?.sourceIds ?? []);
  if ([...currentSourceIds].some((id) => !includedSourceIds.has(id)))
    reasons.push("El PDF final no incluye todas las entregas vigentes.");

  const deletable = input.files.filter((file) => Boolean(file.storageKey));
  return {
    eligible: reasons.length === 0,
    reasons,
    fileCount: deletable.length,
    historicalFileCount: deletable.filter((file) => !file.isCurrent).length,
    reclaimableBytes: deletable.reduce((total, file) => total + file.sizeBytes, 0),
    storageKeys: deletable.flatMap((file) => file.storageKey ? [file.storageKey] : []),
  };
}

export function autoConsolidationDue(finalizedAt: Date | string | null, days: number | null, now = new Date()) {
  if (!finalizedAt || !days || ![7, 14, 30].includes(days)) return false;
  return now.getTime() >= new Date(finalizedAt).getTime() + days * 86_400_000;
}

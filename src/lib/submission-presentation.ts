export const submissionStatusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  SUBMITTED: "Entregado",
  LATE: "Tardío",
  REVIEWING: "En revisión",
  NEEDS_CORRECTION: "Requiere corrección",
  CORRECTED: "Corregido",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

export function submissionStatusLabel(status: string, late = false) {
  if (late && ["SUBMITTED", "LATE"].includes(status)) return "Tardío";
  return submissionStatusLabels[status] ?? "Estado desconocido";
}

export function submissionOriginLabel(origin: string) {
  return origin === "PORTAL"
    ? "Entregado desde el portal"
    : "Carga manual del coordinador";
}

export function submissionVersionLabel(count: number) {
  return `${count} ${count === 1 ? "versión" : "versiones"}`;
}

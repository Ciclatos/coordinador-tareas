export type ReportObservation = {
  memberName: string;
  evaluationComment?: string | null;
  reviewComment?: string | null;
  status?: string | null;
  late?: boolean;
  includeInReport?: boolean;
};

const patterns = {
  presentation: /presentaci[oó]n|formato|orden|limpio/i,
  procedure: /procedimiento|desarrollo|pasos|incomplet/i,
  readability: /legib|borros|lectura|calidad/i,
  communication: /comunicaci[oó]n|coordinaci[oó]n|equipo/i,
} as const;

export function buildCoordinatorObservations(items: ReportObservation[]) {
  const visible = items.filter((item) => item.includeInReport !== false);
  const comments = visible.flatMap((item) =>
    [item.evaluationComment, item.reviewComment].filter(
      (comment): comment is string => Boolean(comment?.trim()),
    ),
  );
  const correctionCount = visible.filter((item) =>
    ["NEEDS_CORRECTION", "CORRECTED"].includes(item.status ?? ""),
  ).length;
  const rejectedCount = visible.filter((item) => item.status === "REJECTED").length;
  const lateCount = visible.filter((item) => item.late).length;
  const sentences: string[] = [];
  if (correctionCount)
    sentences.push(`Durante la revisión se solicitaron correcciones a ${correctionCount === 1 ? "un integrante" : `${correctionCount} integrantes`} por observaciones académicas en sus entregas.`);
  if (lateCount)
    sentences.push(`${lateCount === 1 ? "Un integrante presentó" : `${lateCount} integrantes presentaron`} su entrega fuera del horario establecido, por lo que se consideró la puntualidad correspondiente.`);
  if (rejectedCount)
    sentences.push(`${rejectedCount === 1 ? "Una entrega fue rechazada" : `${rejectedCount} entregas fueron rechazadas`} durante la revisión.`);
  const categories = [
    ["presentation", "la presentación y el orden"],
    ["procedure", "el desarrollo completo de los procedimientos"],
    ["readability", "la legibilidad"],
    ["communication", "la comunicación y el trabajo en equipo"],
  ] as const;
  const mentioned = categories
    .filter(([key]) => comments.some((comment) => patterns[key].test(comment)))
    .map(([, label]) => label);
  if (mentioned.length)
    sentences.push(`Las observaciones se concentraron principalmente en ${new Intl.ListFormat("es", { type: "conjunction" }).format(mentioned)}.`);
  else if (comments.length)
    sentences.push("Se registraron observaciones puntuales del coordinador para orientar la mejora académica de las entregas.");
  return sentences.length ? `Observaciones del coordinador\n\n${sentences.join(" ")}` : "";
}

export function individualReportObservations(items: ReportObservation[]) {
  return items
    .filter((item) => item.includeInReport !== false)
    .map((item) => ({
      memberName: item.memberName,
      observation: item.evaluationComment?.trim() || item.reviewComment?.trim() || "",
    }))
    .filter((item) => item.observation);
}

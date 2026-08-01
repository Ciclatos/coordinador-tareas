import type { Allocation, Exercise, Member } from "./domain";

function owner(exerciseId: string, allocations: Allocation[], members: Member[]) {
  const memberId = allocations.find((item) => item.exerciseId === exerciseId)?.memberId;
  return members.find((member) => member.id === memberId)?.shortName ?? "Sin asignar";
}

export function distributionBySection(
  exercises: Exercise[],
  allocations: Allocation[],
  members: Member[],
) {
  return [...new Set(exercises.map((exercise) => exercise.section))]
    .map((section) => {
      const rows = exercises
        .filter((exercise) => exercise.section === section)
        .map((exercise) => `${exercise.label}: ${owner(exercise.id, allocations, members)}`);
      return `${section}\n${rows.join("\n")}`;
    })
    .join("\n\n");
}

export function distributionByMember(
  exercises: Exercise[],
  allocations: Allocation[],
  members: Member[],
) {
  return members
    .map((member) => {
      const assigned = exercises.filter(
        (exercise) =>
          allocations.find((item) => item.exerciseId === exercise.id)?.memberId === member.id,
      );
      const groups = [...new Set(assigned.map((exercise) => exercise.section))].map(
        (section) =>
          `- Sección ${section}: ${assigned
            .filter((exercise) => exercise.section === section)
            .map((exercise) => exercise.label)
            .join(", ")}.`,
      );
      const weight = assigned.reduce((sum, exercise) => sum + exercise.weight, 0);
      return `${member.shortName}:\n${groups.join("\n") || "- Sin ejercicios."}\n- Total: ${assigned.length} ejercicio${assigned.length === 1 ? "" : "s"}.\n- Peso total: ${weight}.`;
    })
    .join("\n\n");
}

export function distributionSummaryTsv(
  exercises: Exercise[],
  allocations: Allocation[],
  members: Member[],
) {
  const sections = [...new Set(exercises.map((exercise) => exercise.section))];
  const header = ["Integrante", ...sections, "Cantidad", "Peso"].join("\t");
  const rows = members.map((member) => {
    const assigned = exercises.filter(
      (exercise) =>
        allocations.find((item) => item.exerciseId === exercise.id)?.memberId === member.id,
    );
    return [
      member.name,
      ...sections.map((section) =>
        assigned
          .filter((exercise) => exercise.section === section)
          .map((exercise) => exercise.label)
          .join(", "),
      ),
      assigned.length,
      assigned.reduce((sum, exercise) => sum + exercise.weight, 0),
    ].join("\t");
  });
  return [header, ...rows].join("\n");
}

export function whatsappMessage(input: {
  courseName: string;
  assignmentNumber: number;
  title: string;
  dueAt: string;
  instructions?: string | null;
  memberView: string;
}) {
  const due = new Intl.DateTimeFormat("es-GT", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Guatemala",
  }).format(new Date(input.dueAt));
  return `*${input.courseName} - Tarea ${input.assignmentNumber}*\n${input.title}\n\n*Distribución*\n${input.memberView}\n\n*Fecha límite:* ${due}\n*Formatos:* PDF, JPG, PNG o WEBP.\n${input.instructions?.trim() ? `*Instrucciones:* ${input.instructions.trim()}\n` : ""}Recuerden enviar el procedimiento completo, ordenado y legible.`;
}

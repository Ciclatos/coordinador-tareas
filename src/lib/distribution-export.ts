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
  exercises: Exercise[];
  allocations: Allocation[];
  members: Member[];
}) {
  const due = new Intl.DateTimeFormat("es-GT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    hour12: false,
    timeZone: "America/Guatemala",
  }).format(new Date(input.dueAt)).replace(",", " —");
  const sections = [...new Set(input.exercises.map((exercise) => exercise.section))];
  const members = input.members.map((member) => {
    const assigned = input.exercises.filter((exercise) =>
      input.allocations.some((allocation) => allocation.exerciseId === exercise.id && allocation.memberId === member.id));
    const groups = sections.map((section) => {
      const labels = assigned.filter((exercise) => exercise.section === section).map((exercise) => exercise.label);
      return labels.length ? `• ${section}: ${labels.join(", ")}` : "";
    }).filter(Boolean);
    return `${member.name}\n${groups.join("\n") || "• Sin ejercicios"}\n• Total: ${assigned.length} ejercicio${assigned.length === 1 ? "" : "s"}`;
  }).join("\n\n");
  const reminder = input.instructions?.trim() || "Resolver mostrando el procedimiento completo y enviar en PDF legible.";
  return `📘 ${input.courseName} — Tarea ${input.assignmentNumber}${input.title ? `: ${input.title}` : ""}\n📅 Entrega: ${due}\n📚 Secciones: ${sections.join(", ")}\n\n${members}\n\nRecordatorio:\n${reminder}`;
}

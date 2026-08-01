export type Member = {
  id: string;
  name: string;
  shortName: string;
  carnet: string;
  email?: string | null;
  historicalLoad: number;
  active: boolean;
};
export type Exercise = {
  id: string;
  sectionId: string;
  section: string;
  label: string;
  weight: number;
};
export type Allocation = {
  exerciseId: string;
  memberId: string;
  locked?: boolean;
};

export const demoMembers: Member[] = [
  ["m1", "Ana Lucía Pérez", "Ana", "2026-01-1001", 5],
  ["m2", "Diego Mateo López", "Diego", "2026-01-1002", 4],
  ["m3", "Sofía Isabel García", "Sofía", "2026-01-1003", 6],
  ["m4", "Mateo Andrés Ruiz", "Mateo", "2026-01-1004", 3],
  ["m5", "Valeria Fernanda Díaz", "Valeria", "2026-01-1005", 5],
  ["m6", "Daniel Alejandro Paz", "Daniel", "2026-01-1006", 4],
].map(([id, name, shortName, carnet, historicalLoad]) => ({
  id: String(id),
  name: String(name),
  shortName: String(shortName),
  carnet: String(carnet),
  historicalLoad: Number(historicalLoad),
  active: true,
}));

export function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

export function generateLabels(
  input: string,
  rule: "manual" | "range" | "odd" | "even" | "multiple",
  factor = 5,
): string[] {
  if (rule === "manual")
    return [
      ...new Set(
        input
          .split(/[\n,;]+/)
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ].sort(naturalCompare);
  const match = input.match(/(\d+)\D+(\d+)/);
  if (!match) throw new Error("Escribe un rango, por ejemplo: 1 al 25");
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > end || end - start > 500)
    throw new Error("El rango no es válido");
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    .filter(
      (n) =>
        rule === "range" ||
        (rule === "odd" && n % 2 === 1) ||
        (rule === "even" && n % 2 === 0) ||
        (rule === "multiple" && n % factor === 0),
    )
    .map(String);
}

export function buildExercises(
  sections: { id: string; name: string; labels: string[] }[],
): Exercise[] {
  return sections.flatMap((s) =>
    s.labels.map((label) => ({
      id: `${s.id}:${label}`,
      sectionId: s.id,
      section: s.name,
      label,
      weight: 1,
    })),
  );
}

export function distribute(
  exercises: Exercise[],
  members: Member[],
  locked: Allocation[] = [],
  seed = 5,
): Allocation[] {
  const eligible = members.filter((m) => m.active);
  if (!eligible.length) throw new Error("No hay integrantes disponibles");
  const exerciseIds = new Set(exercises.map((e) => e.id));
  const fixed = locked.filter(
    (a) =>
      a.locked &&
      exerciseIds.has(a.exerciseId) &&
      eligible.some((m) => m.id === a.memberId),
  );
  const assigned = new Set(fixed.map((a) => a.exerciseId));
  const loads = new Map(
    eligible.map((m) => [
      m.id,
      m.historicalLoad +
        fixed
          .filter((a) => a.memberId === m.id)
          .reduce(
            (sum, a) =>
              sum + (exercises.find((e) => e.id === a.exerciseId)?.weight ?? 1),
            0,
          ),
    ]),
  );
  const result = [...fixed];
  const sections = [...new Set(exercises.map((e) => e.sectionId))];
  sections.forEach((sectionId, sectionIndex) => {
    exercises
      .filter((e) => e.sectionId === sectionId && !assigned.has(e.id))
      .forEach((exercise, index) => {
        const rotation = (seed + sectionIndex + index) % eligible.length;
        const ordered = [...eligible].sort(
          (a, b) =>
            loads.get(a.id)! - loads.get(b.id)! ||
            ((eligible.indexOf(a) - rotation + eligible.length) %
              eligible.length) -
              ((eligible.indexOf(b) - rotation + eligible.length) %
                eligible.length) ||
            naturalCompare(a.name, b.name),
        );
        const member = ordered[0];
        result.push({ exerciseId: exercise.id, memberId: member.id });
        loads.set(member.id, loads.get(member.id)! + exercise.weight);
      });
  });
  return result;
}

export function grade(scores: number[], maxima: number[]) {
  return scores.reduce(
    (total, score, i) => total + Math.max(0, Math.min(score, maxima[i] ?? 0)),
    0,
  );
}

export function reportText(
  sectionNames: string[],
  pending: number,
  late: number,
  extras: string[],
  excluded: string[] = [],
) {
  const sections = new Intl.ListFormat("es", {
    style: "long",
    type: "conjunction",
  }).format(sectionNames);
  const scope = sectionNames.length
    ? `los ejercicios asignados de ${sectionNames.length === 1 ? "la sección" : "las secciones"} ${sections}`
    : "la planificación inicial de la tarea";
  return `Durante la presente semana se trabajó en ${scope}. La distribución híbrida equilibró la carga actual con el historial del grupo y conservó la identidad de cada sección.${extras.length ? ` La carga adicional correspondió a ${extras.join(", ")} por presentar el menor saldo acumulado.` : ""}${excluded.length ? ` Se excluyó temporalmente de esta tarea a ${new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(excluded)}.` : ""} ${pending ? `Quedaron ${pending} entrega${pending === 1 ? "" : "s"} pendiente${pending === 1 ? "" : "s"}.` : "Todos los integrantes participantes entregaron su trabajo."}${late ? ` Se registraron ${late} entrega${late === 1 ? "" : "s"} tardía${late === 1 ? "" : "s"}.` : " No se registraron entregas tardías."}`;
}

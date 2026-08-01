import { describe, expect, it } from "vitest";
import {
  buildExercises,
  demoMembers,
  distribute,
  generateLabels,
  grade,
  reportText,
} from "./domain";
describe("generación de ejercicios", () => {
  it("genera pares, impares y múltiplos", () => {
    expect(generateLabels("1 al 10", "even")).toEqual([
      "2",
      "4",
      "6",
      "8",
      "10",
    ]);
    expect(generateLabels("1 al 7", "odd")).toEqual(["1", "3", "5", "7"]);
    expect(generateLabels("1 al 20", "multiple", 5)).toEqual([
      "5",
      "10",
      "15",
      "20",
    ]);
  });
  it("elimina duplicados y admite etiquetas", () =>
    expect(generateLabels("5a, 5b, 6, 5a", "manual")).toEqual([
      "5a",
      "5b",
      "6",
    ]));
  it("reinicia numeración e identifica el mismo número por sección", () => {
    const e = buildExercises([
      { id: "a", name: "5.3", labels: ["5"] },
      { id: "b", name: "5.4", labels: ["5"] },
    ]);
    expect(e.map((x) => x.id)).toEqual(["a:5", "b:5"]);
  });
});
describe("distribución híbrida", () => {
  const exercises = buildExercises([
    { id: "a", name: "5.3", labels: generateLabels("1 al 25", "multiple") },
    { id: "b", name: "5.4", labels: generateLabels("1 al 25", "multiple") },
    { id: "c", name: "5.5", labels: generateLabels("1 al 25", "multiple") },
  ]);
  it("asigna cada ejercicio exactamente una vez", () => {
    const a = distribute(exercises, demoMembers);
    expect(a).toHaveLength(exercises.length);
    expect(new Set(a.map((x) => x.exerciseId)).size).toBe(exercises.length);
  });
  it("es determinista y equilibra el residuo según historial", () => {
    const a = distribute(exercises, demoMembers);
    expect(distribute(exercises, demoMembers)).toEqual(a);
    const combined = demoMembers.map(
      (m) => m.historicalLoad + a.filter((x) => x.memberId === m.id).length,
    );
    expect(Math.max(...combined) - Math.min(...combined)).toBeLessThanOrEqual(
      1,
    );
  });
  it("respeta exclusiones y bloqueos", () => {
    const members = demoMembers.map((m, i) => ({ ...m, active: i !== 0 }));
    const locked = [
      { exerciseId: exercises[0].id, memberId: members[1].id, locked: true },
    ];
    const a = distribute(exercises, members, locked);
    expect(a.find((x) => x.exerciseId === exercises[0].id)?.memberId).toBe(
      members[1].id,
    );
    expect(a.some((x) => x.memberId === members[0].id)).toBe(false);
  });
  it("considera peso", () => {
    const weighted = exercises.map((e, i) => ({
      ...e,
      weight: i === 0 ? 3 : 1,
    }));
    expect(distribute(weighted, demoMembers)).toHaveLength(weighted.length);
  });
});
describe("evaluación y reporte", () => {
  it("limita notas a sus máximos", () =>
    expect(grade([25, 18, -2], [20, 20, 20])).toBe(38));
  it("genera texto determinista según estado", () => {
    const r = reportText(["5.3", "5.4"], 2, 1, ["Ana"]);
    expect(r).toContain("5.3 y 5.4");
    expect(r).toContain("2 entregas pendientes");
    expect(r).toContain("Ana");
  });
  it("describe una tarea todavía sin secciones sin producir una frase vacía", () => {
    const r = reportText([], 0, 0, []);
    expect(r).toContain("planificación inicial de la tarea");
    expect(r).not.toContain("secciones .");
  });
});

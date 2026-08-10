import { describe, expect, it } from "vitest";
import { buildCoordinatorObservations, individualReportObservations } from "./report-observations";

describe("observaciones del reporte", () => {
  it("omite el bloque cuando no existen comentarios o eventos relevantes", () => {
    expect(buildCoordinatorObservations([{ memberName: "Ana" }])).toBe("");
  });

  it("resume corrección, puntualidad y categorías sin copiar comentarios en bruto", () => {
    const text = buildCoordinatorObservations([
      { memberName: "Ana", status: "NEEDS_CORRECTION", evaluationComment: "Procedimiento incompleto y presentación desordenada" },
      { memberName: "Luis", late: true, reviewComment: "Archivo poco legible" },
    ]);
    expect(text).toMatch(/Observaciones del coordinador/);
    expect(text).toMatch(/correcciones a un integrante/);
    expect(text).toMatch(/fuera del horario/);
    expect(text).toMatch(/presentación.*procedimientos.*legibilidad/);
    expect(text).not.toContain("desordenada");
  });

  it("genera tabla individual solo con observaciones públicas no vacías", () => {
    expect(individualReportObservations([
      { memberName: "Ana", evaluationComment: "Entrega completa." },
      { memberName: "Luis", evaluationComment: "", reviewComment: "Interno", includeInReport: false },
    ])).toEqual([{ memberName: "Ana", observation: "Entrega completa." }]);
  });
});

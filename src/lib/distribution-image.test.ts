import { describe, expect, it } from "vitest";
import { buildExercises, demoMembers, distribute } from "./domain";
import { createDistributionSvg, distributionImageFileName, type DistributionImageOptions } from "./distribution-image";

const exercises = buildExercises([
  { id: "a", name: "5.3", labels: ["5", "10", "15", "20", "25", "30"] },
  { id: "b", name: "5.4", labels: ["5", "10", "15", "20", "25", "30", "35", "40", "45", "50"] },
  { id: "c", name: "5.5", labels: ["5", "10", "15", "20"] },
]);
const members = demoMembers.map((member, index) => ({ ...member, name: index === 0 ? "Alejandra María de los Ángeles Nombre Extenso" : member.name }));
const base: DistributionImageOptions = { view: "matrix", includeDueDate: true, includeInstructions: true, includeTotal: true, includeWeight: true, size: "normal", orientation: "vertical", footer: "Resolver todos los ejercicios mostrando el procedimiento completo y enviar en formato PDF legible." };

describe("imagen tabular de distribución", () => {
  it.each(["vertical", "horizontal"] as const)("genera SVG reproducible %s con encabezados, integrantes y secciones", (orientation) => {
    const svg = createDistributionSvg({ courseName: "Cálculo 2", assignmentNumber: 4, assignmentTitle: "Series", dueAt: "2026-08-10T20:00:00Z", instructions: "Usar tinta negra", exercises, allocations: distribute(exercises, members), members, options: { ...base, orientation } });
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain("DISTRIBUCIÓN DE EJERCICIOS");
    expect(svg).toContain("Sección 5.3");
    expect(svg).toContain("Sección 5.4");
    expect(svg).toContain("Sección 5.5");
    members.forEach((member) => member.name.split(/\s+/).forEach((word) => expect(svg).toContain(word)));
    const width = Number(svg.match(/width="(\d+)"/)?.[1]);
    const height = Number(svg.match(/height="(\d+)"/)?.[1]);
    expect(width).toBeGreaterThanOrEqual(900);
    expect(height).toBeGreaterThanOrEqual(600);
  });
  it("produce un nombre descriptivo", () => expect(distributionImageFileName("Cálculo 2", 4)).toBe("calculo-2-tarea-4-distribucion.png"));
});

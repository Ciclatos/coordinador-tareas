import { describe, expect, it } from "vitest";
import {
  distributionByMember,
  distributionBySection,
  distributionSummaryTsv,
  whatsappMessage,
} from "./distribution-export";
import { buildExercises, demoMembers, distribute } from "./domain";

const members = demoMembers.slice(0, 2);
const exercises = buildExercises([
  { id: "s1", name: "5.3", labels: ["1", "2"] },
  { id: "s2", name: "5.4", labels: ["1", "2"] },
]);
const allocations = distribute(exercises, members);

describe("exportaciones de distribución", () => {
  it("genera vistas por sección, integrante y tabla TSV", () => {
    expect(distributionBySection(exercises, allocations, members)).toContain("5.3");
    expect(distributionByMember(exercises, allocations, members)).toMatch(/peso/i);
    expect(distributionByMember(exercises, allocations, members)).toContain("Sección 5.3");
    expect(distributionByMember(exercises, allocations, members)).toContain("Total:");
    expect(distributionSummaryTsv(exercises, allocations, members)).toMatch(/^Integrante\t/);
  });
  it("genera mensaje de WhatsApp con plazo, formatos e instrucciones", () => {
    const message = whatsappMessage({
      courseName: "Matemática",
      assignmentNumber: 5,
      title: "Sucesiones",
      dueAt: "2026-08-10T05:59:00.000Z",
      instructions: "Usar tinta negra.",
      memberView: "Ana: 1, 2",
    });
    expect(message).toContain("*Matemática - Tarea 5*");
    expect(message).toContain("PDF, JPG, PNG o WEBP");
    expect(message).toContain("Usar tinta negra");
  });
});

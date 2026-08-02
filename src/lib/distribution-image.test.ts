import { describe, expect, it, vi } from "vitest";
import { buildExercises, distribute, type Member } from "./domain";
import {
  createDistributionImages,
  distributionImageFileName,
  imageExportCapabilities,
  pngZip,
  type DistributionImageOptions,
} from "./distribution-image";

const members: Member[] = [
  "Carlos Eduardo Díaz García",
  "Jonathan Iván de la Cruz Jiménez",
  "Alejandra María de los Ángeles Ramírez",
  "María Fernanda Castellanos Monterroso",
  "José Alejandro Hernández Villanueva",
  "Ana Sofía del Rosario López Mendoza",
].map((name, index) => ({ id: `m${index + 1}`, name, shortName: name.split(" ")[0], carnet: `2026-${index}`, historicalLoad: 0, active: true }));
const labels = (start: number) => Array.from({ length: 76 }, (_, index) => String(start + index * 6));
const exercises = buildExercises([
  { id: "a", name: "5.3", labels: labels(2) },
  { id: "b", name: "5.4", labels: labels(4) },
  { id: "c", name: "5.5", labels: labels(6) },
]);
const allocations = distribute(exercises, members);
const base: DistributionImageOptions = {
  view: "summary", includeDueDate: true, includeInstructions: true, includeTotal: true,
  includeWeight: true, size: "whatsapp", nameMode: "full", primaryColor: "#17624f",
  footer: "Resolver todos los ejercicios mostrando el procedimiento completo y enviar en un PDF legible.",
};
const input = { courseName: "Cálculo 2", assignmentNumber: 4, assignmentTitle: "Series", dueAt: "2026-08-10T20:00:00Z", instructions: "Usar tinta negra", exercises, allocations, members, options: base };

describe("exportación visual de distribución", () => {
  it("genera un resumen vertical para seis integrantes, tres secciones y listas largas sin perder ejercicios", () => {
    const pages = createDistributionImages(input);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.width === 1080 && page.height <= 1920)).toBe(true);
    expect(pages[0].filename).toBe("calculo-2-tarea-4-distribucion-parte-1.png");
    expect(pages[1].svg).toContain("Parte 2 de");
    members.forEach((member) => expect(pages.some((page) => page.svg.includes(member.name))).toBe(true));
    for (const member of members) {
      const total = allocations.filter((allocation) => allocation.memberId === member.id).length;
      expect([38]).toContain(total);
      expect(pages.some((page) => page.svg.includes(`Total: ${total} ejercicios`))).toBe(true);
    }
    expect(pages.map((page) => page.svg).join("\n")).not.toContain("…");
  });

  it("genera una tarjeta completa y un nombre descriptivo por integrante", () => {
    const pages = createDistributionImages({ ...input, options: { ...base, view: "cards" } });
    expect(pages).toHaveLength(6);
    expect(pages[0].filename).toBe("calculo-2-tarea-4-carlos-eduardo-diaz-garcia.png");
    expect(pages[0].svg).toContain("Carlos Eduardo Díaz García");
    expect(pages[0].svg).toContain("5.3:");
    expect(pages[0].height).toBeGreaterThan(700);
  });

  it("conserva la matriz clásica para uso administrativo", () => {
    const [page] = createDistributionImages({ ...input, options: { ...base, view: "matrix", size: "high" } });
    expect(page.filename).toContain("matriz-clasica");
    expect(page.svg).toContain("Secciones");
    expect(page.svg).toContain("Integrante");
    expect(page.width).toBe(1920);
  });

  it("crea un ZIP estándar con todas las tarjetas", async () => {
    const blob = pngZip([{ filename: "uno.png", bytes: new Uint8Array([137, 80, 78, 71]) }, { filename: "dos.png", bytes: new Uint8Array([1, 2]) }]);
    expect(blob.type).toBe("application/zip");
    expect(new Uint8Array(await blob.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([80, 75]));
  });

  it("detecta fallbacks de portapapeles y compartir", () => {
    expect(imageExportCapabilities(undefined)).toEqual({ clipboard: false, share: false });
    const fakeNavigator = { clipboard: { write: vi.fn() }, share: vi.fn(), canShare: vi.fn() } as unknown as Navigator;
    expect(imageExportCapabilities(fakeNavigator).share).toBe(true);
  });

  it("produce el nombre general esperado", () => expect(distributionImageFileName("Cálculo 2", 4)).toBe("calculo-2-tarea-4-distribucion.png"));
});

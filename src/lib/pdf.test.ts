import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createAssignmentPdf, type AssignmentPdfData } from "@/lib/pdf";

function data(files: File[] = []): AssignmentPdfData {
  return {
    systemName: "Coordinador de Tareas",
    course: {
      name: "Matemática de prueba",
      code: "MAT-001",
      teacher: "Docente Ficticio",
      university: "Universidad de Prueba",
      faculty: "Facultad de Ingeniería",
      groupNumber: "2",
    },
    assignment: {
      number: 5,
      weekNumber: 5,
      title: "Ejercicios de prueba",
      topic: "Sucesiones",
      weekStart: "2026-08-03T06:00:00.000Z",
      weekEnd: "2026-08-09T06:00:00.000Z",
      dueAt: "2026-08-10T05:59:00.000Z",
    },
    members: [
      {
        id: "m1",
        name: "Ana Ficticia",
        shortName: "Ana",
        carnet: "TEST-001",
        historicalLoad: 0,
        active: true,
      },
    ],
    exercises: [
      { id: "e1", sectionId: "s1", section: "Sección 5.3", label: "5", weight: 1 },
    ],
    allocations: [{ exerciseId: "e1", memberId: "m1" }],
    evaluations: [
      {
        memberId: "m1",
        total: 100,
        scores: [
          "Puntualidad",
          "Presentación PDF",
          "Trabajo en equipo",
          "Comunicación",
          "Ejercicios completos",
        ].map((name) => ({ name, score: 20, maxScore: 20 })),
      },
    ],
    reportBody:
      "Durante la presente semana se trabajaron los ejercicios asignados de la sección 5.3. Todos los integrantes entregaron su trabajo y no se registraron entregas tardías.",
    files,
  };
}

describe("constructor PDF", () => {
  it("genera las cinco secciones administrativas sin duplicar integrantes", async () => {
    const bytes = await createAssignmentPdf(data());
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(5);
    expect(pdf.getTitle()).toBe("Matemática de prueba - Tarea 5");
  });

  it("divide tablas extensas y conserva una orientación legible", async () => {
    const input = data();
    input.members = Array.from({ length: 14 }, (_, index) => ({
      ...input.members[0],
      id: `m${index + 1}`,
      name: `Integrante Ficticio de Nombre Extenso Número ${index + 1}`,
      carnet: `TEST-${index + 1}`,
    }));
    input.allocations = input.members.map((member) => ({
      exerciseId: "e1",
      memberId: member.id,
    }));
    input.evaluations = input.members.map((member, index) => ({
      memberId: member.id,
      total: 100 - index,
      scores: data().evaluations[0].scores,
    }));
    const bytes = await createAssignmentPdf(input);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(5);
    expect(
      pdf
        .getPages()
        .every(
          (page) => page.getWidth() === 612 && page.getHeight() === 792,
        ),
    ).toBe(true);
  });

  it("incorpora todas las páginas de una entrega PDF", async () => {
    const source = await PDFDocument.create();
    source.addPage([612, 792]);
    source.addPage([612, 792]);
    const file = new File([await source.save() as BlobPart], "entrega.pdf", {
      type: "application/pdf",
    });
    const bytes = await createAssignmentPdf(data([file]));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(7);
  });

  it("aplica selección de páginas y rotación a una entrega almacenada", async () => {
    const source = await PDFDocument.create();
    source.addPage([612, 792]);
    source.addPage([612, 792]);
    source.addPage([612, 792]);
    const sourceBytes = await source.save();
    const input = data();
    input.storedFiles = [
      {
        id: "stored-1",
        name: "entrega-almacenada.pdf",
        mimeType: "application/pdf",
        url: `data:application/pdf;base64,${Buffer.from(sourceBytes).toString("base64")}`,
        selectedPages: [1],
        rotation: 90,
      },
    ];
    const bytes = await createAssignmentPdf(input);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(6);
    expect(pdf.getPage(5).getRotation().angle).toBe(90);
  });
});

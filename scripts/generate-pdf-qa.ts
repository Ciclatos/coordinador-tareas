import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAssignmentPdf, type AssignmentPdfData } from "../src/lib/pdf";

async function main() {
const source = await PDFDocument.create();
const font = await source.embedFont(StandardFonts.Helvetica);
for (let index = 0; index < 24; index += 1) {
  const page = source.addPage([612, 792]);
  page.drawText(`Desarrollo ficticio - ejercicio ${index + 1}`, {
    x: 70,
    y: 700,
    size: 16,
    font,
    color: rgb(0.1, 0.15, 0.13),
  });
  page.drawRectangle({
    x: 70,
    y: 120,
    width: 472,
    height: 520,
    borderWidth: 1,
    borderColor: rgb(0.7, 0.75, 0.72),
  });
}
const sourceFile = new File([await source.save() as BlobPart], "desarrollo-24-paginas.pdf", {
  type: "application/pdf",
});
const imageFile = new File(
  [await readFile(new URL("../public/assets/umg-logo.png", import.meta.url)) as BlobPart],
  "imagen-ejercicio.png",
  { type: "image/png" },
);
const names = ["Ana", "Diego", "Sofía", "Mateo", "Valeria", "Daniel"];
const members = names.map((name, index) => ({
  id: `m${index + 1}`,
  name: `${name} Integrante Ficticio`,
  shortName: name,
  carnet: `TEST-2026-${String(index + 1).padStart(3, "0")}`,
  historicalLoad: index,
  active: true,
}));
const exercises = ["5.3", "5.4", "5.5"].flatMap((section, sectionIndex) =>
  ["5", "10", "15", "20", "25"].map((label, index) => ({
    id: `s${sectionIndex}:${label}`,
    sectionId: `s${sectionIndex}`,
    section: `Sección ${section}`,
    label,
    weight: 1,
    memberId: members[(sectionIndex + index) % members.length].id,
  })),
);
const criteria = [
  "Puntualidad",
  "Presentación PDF",
  "Trabajo en equipo",
  "Comunicación",
  "Ejercicios completos",
];
const data: AssignmentPdfData = {
  systemName: "Coordinador de Tareas",
  logoBytes: new Uint8Array(
    await readFile(new URL("../public/assets/umg-logo.png", import.meta.url)),
  ),
  course: {
    name: "Matemática Discreta",
    code: "MAT-101",
    teacher: "Docente Ficticio",
    degree: "Ingeniería en Sistemas",
    faculty: "Facultad de Ingeniería",
    university: "Universidad Mariano Gálvez de Guatemala",
    campus: "Sede de Prueba",
    shift: "Vespertina",
    semester: "Segundo",
    section: "A",
    groupNumber: "2",
  },
  assignment: {
    number: 5,
    weekNumber: 5,
    title: "Sucesiones y series",
    topic: "Ejercicios semanales",
    weekStart: "2026-08-03T06:00:00.000Z",
    weekEnd: "2026-08-09T06:00:00.000Z",
    dueAt: "2026-08-10T05:59:00.000Z",
  },
  members,
  exercises,
  allocations: exercises.map((exercise) => ({
    exerciseId: exercise.id,
    memberId: exercise.memberId,
  })),
  evaluations: members.map((member, index) => ({
    memberId: member.id,
    total: 100 - index,
    scores: criteria.map((name, criterionIndex) => ({
      name,
      maxScore: 20,
      score: criterionIndex === 0 ? 20 - index : 20,
    })),
  })),
  reportBody:
    "Durante la presente semana se trabajaron los ejercicios asignados de las secciones 5.3, 5.4 y 5.5. La distribución híbrida equilibró la carga actual con el historial del grupo y conservó la identidad de cada sección. Todos los integrantes entregaron su trabajo. No se registraron entregas tardías.",
  files: [sourceFile, imageFile],
};
await mkdir(new URL("../output/pdf/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../output/pdf/qa-30-pages.pdf", import.meta.url),
  await createAssignmentPdf(data),
);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

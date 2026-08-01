import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { buildExercises, demoMembers, distribute } from "../src/lib/domain";
import { createDistributionSvg } from "../src/lib/distribution-image";

const exercises = buildExercises([
  { id: "qa-53", name: "5.3", labels: ["5", "10", "15", "20", "25", "30"] },
  { id: "qa-54", name: "5.4", labels: ["5", "10", "15", "20", "25", "30", "35", "40", "45", "50"] },
  { id: "qa-55", name: "5.5", labels: ["5", "10", "15", "20"] },
]);
const members = demoMembers.map((member, index) => ({
  ...member,
  name: index === 0 ? "Alejandra María de los Ángeles - Nombre Ficticio Extenso" : member.name,
}));
const svg = createDistributionSvg({
  courseName: "Cálculo II - Demostración",
  assignmentNumber: 4,
  assignmentTitle: "Sucesiones y series",
  dueAt: "2026-08-10T23:59:00-06:00",
  instructions: "Presentar cada procedimiento completo, ordenado y con resultados legibles.",
  exercises,
  allocations: distribute(exercises, members),
  members,
  options: {
    view: "matrix",
    includeDueDate: true,
    includeInstructions: true,
    includeTotal: true,
    includeWeight: true,
    size: "large",
    orientation: "horizontal",
    footer: "Resolver todos los ejercicios mostrando el procedimiento completo y enviar en formato PDF legible.",
  },
});

async function main() {
  const outputDirectory = path.resolve("output/qa");
  const output = path.join(outputDirectory, "distribucion-secciones-diferentes.png");
  await mkdir(outputDirectory, { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(output);
  const metadata = await sharp(output).metadata();
  if (metadata.format !== "png" || (metadata.width ?? 0) < 1200 || (metadata.height ?? 0) < 700)
    throw new Error("La imagen de QA no cumple formato o resolución mínima.");
  console.log(JSON.stringify({ output, format: metadata.format, width: metadata.width, height: metadata.height }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

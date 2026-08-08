import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { buildExercises, distribute, type Member } from "../src/lib/domain";
import { createDistributionImages, type DistributionImageOptions } from "../src/lib/distribution-image";

const names = [
  "Carlos Eduardo Díaz García",
  "Jonathan Iván de la Cruz Jiménez",
  "Alejandra María de los Ángeles Ramírez",
  "María Fernanda Castellanos Monterroso",
  "José Alejandro Hernández Villanueva",
  "Ana Sofía del Rosario López Mendoza",
];
const members: Member[] = names.map((name, index) => ({
  id: `qa-m${index + 1}`, name, shortName: name.split(" ")[0], carnet: `2026-01-${1001 + index}`,
  historicalLoad: 0, active: true,
}));
const sequence = (start: number) => Array.from({ length: 76 }, (_, index) => String(start + index * 6));
const exercises = buildExercises([
  { id: "qa-53", name: "5.3", labels: sequence(2) },
  { id: "qa-54", name: "5.4", labels: sequence(4) },
  { id: "qa-55", name: "5.5", labels: sequence(6) },
]);
const allocations = distribute(exercises, members);
const options: DistributionImageOptions = {
  view: "summary", includeDueDate: true, includeInstructions: true, includeTotal: true,
  includeWeight: false, size: "whatsapp", nameMode: "full", primaryColor: "#17624f",
  footer: "Resolver todos los ejercicios mostrando el procedimiento completo y enviar en un PDF legible.",
};
const input = {
  courseName: "Cálculo 2", assignmentNumber: 4, assignmentTitle: "Sucesiones y series",
  dueAt: "2026-08-10T18:00:00-06:00", instructions: null, exercises, allocations, members, options,
};

async function writePng(svg: string, output: string) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(output);
  const metadata = await sharp(output).metadata();
  if (metadata.format !== "png" || !metadata.width || !metadata.height)
    throw new Error(`PNG inválido: ${output}`);
  return { output, width: metadata.width, height: metadata.height, format: metadata.format };
}

async function main() {
  const directory = path.resolve("output/qa");
  await mkdir(directory, { recursive: true });
  const summary = createDistributionImages(input);
  if (summary.length !== 1) throw new Error("El resumen debe generarse en una sola imagen.");
  const card = createDistributionImages({ ...input, options: { ...options, view: "cards" } })[0];
  const matrix = createDistributionImages({ ...input, options: { ...options, view: "matrix", size: "high" } })[0];
  const results = await Promise.all([
    writePng(summary[0].svg, path.join(directory, "whatsapp-resumen.png")),
    writePng(card.svg, path.join(directory, "tarjeta-integrante.png")),
    writePng(matrix.svg, path.join(directory, "matriz-clasica.png")),
  ]);
  console.log(JSON.stringify({ members: members.length, sections: 3, exercises: exercises.length, totals: members.map((member) => allocations.filter((item) => item.memberId === member.id).length), results }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

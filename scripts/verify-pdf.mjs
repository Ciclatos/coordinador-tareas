import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const input = resolve(process.argv[2] || "output/pdf/qa-30-pages.pdf");
const minimumPages = Number(process.argv[3] || 1);
const renderDirectory = resolve("tmp/pdfs/qa-render");
await rm(renderDirectory, { recursive: true, force: true });
await mkdir(renderDirectory, { recursive: true });
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} falló`);
  return result.stdout;
}
const pdfinfoExecutable = spawnSync("which", ["pdfinfo"], { encoding: "utf8" }).stdout.trim();
const bundledPython = resolve(dirname(pdfinfoExecutable), "../../python/bin/python3");
const python = existsSync(bundledPython) ? bundledPython : "python3";
const info = run("pdfinfo", [input]);
const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
const pageSize = info.match(/^Page size:\s+(.+)$/m)?.[1] || "desconocido";
if (pages < minimumPages) throw new Error(`Se esperaban al menos ${minimumPages} páginas; se encontraron ${pages}.`);
run("pdftoppm", ["-png", "-r", "110", input, resolve(renderDirectory, "pagina")]);
const rendered = (await readdir(renderDirectory)).filter(
  (name) => name.endsWith(".png") && !name.startsWith("._"),
);
if (rendered.length !== pages) throw new Error(`Se renderizaron ${rendered.length} de ${pages} páginas.`);
for (const name of rendered) {
  if ((await stat(resolve(renderDirectory, name))).size < 500)
    throw new Error(`${name} parece estar vacío.`);
}
const text = run(python, [
  "-c",
  "from pypdf import PdfReader; import sys; print('\\n'.join((p.extract_text() or '') for p in PdfReader(sys.argv[1]).pages))",
  input,
]);
const administrativeSizes = JSON.parse(
  run(python, [
    "-c",
    "from pypdf import PdfReader; import json,sys; r=PdfReader(sys.argv[1]); print(json.dumps([[float(p.mediabox.width),float(p.mediabox.height)] for p in r.pages[:10]]))",
    input,
  ]),
);
if (
  administrativeSizes.some(
    ([width, height]) => width !== 612 || height !== 792,
  )
)
  throw new Error("Las páginas administrativas no conservan tamaño carta vertical.");
const headings = [
  "UNIVERSIDAD MARIANO GÁLVEZ DE GUATEMALA",
  "DISTRIBUCIÓN DE EJERCICIOS",
  "REPORTE DE TRABAJO Y DESEMPEÑO",
  "ASPECTOS EVALUABLES",
  "NOTA DEL COORDINADOR",
];
for (const heading of headings) {
  if (!text.includes(heading)) throw new Error(`Falta el encabezado: ${heading}`);
}
const positions = headings.map((heading) => text.indexOf(heading));
if (positions.some((position, index) => index > 0 && position <= positions[index - 1]))
  throw new Error("Las secciones administrativas no están en el orden requerido.");
if ((text.match(/INTEGRANTES DEL GRUPO/g) || []).length !== 1)
  throw new Error("La lista de integrantes debe aparecer una sola vez en la carátula.");
for (const expected of ["TEST-2026-014", "100/100", "87/100", "Sección 5.3", "Sección 5.4", "Sección 5.5"]) {
  if (!text.includes(expected)) throw new Error(`Falta el dato QA: ${expected}`);
}
for (const criterion of [
  "Puntualidad",
  "Presentación PDF",
  "Trabajo en equipo",
  "Comunicación",
  "Ejercicios completos",
]) {
  if ((text.match(new RegExp(criterion, "g")) || []).length !== 14)
    throw new Error(`El criterio ${criterion} no aparece una vez por integrante.`);
}
console.log(JSON.stringify({ input, pages, pageSize, rendered: rendered.length }, null, 2));

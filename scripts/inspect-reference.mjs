import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const input = resolve(process.argv[2] || "references/tarea-semana-5-ejemplo.pdf");
const output = resolve("tmp/pdfs/reference-inspection");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const pdfinfoExecutable = spawnSync("which", ["pdfinfo"], { encoding: "utf8" }).stdout.trim();
const bundledPython = resolve(dirname(pdfinfoExecutable), "../../python/bin/python3");
const python = existsSync(bundledPython) ? bundledPython : "python3";
for (const [command, args] of [
  ["pdfinfo", [input]],
  ["pdftoppm", ["-png", "-r", "130", input, resolve(output, "pagina")]],
  [
    python,
    [
      "-c",
      "from pypdf import PdfReader; from pathlib import Path; import sys; r=PdfReader(sys.argv[1]); o=Path(sys.argv[2]); (o/'texto.txt').write_text('\\n'.join((p.extract_text() or '') for p in r.pages), encoding='utf-8'); [(o/f'activo-{pi+1}-{ii+1}-{img.name}').write_bytes(img.data) for pi,p in enumerate(r.pages) for ii,img in enumerate(p.images)]",
      input,
      output,
    ],
  ],
]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} falló`);
  if (command === "pdfinfo") process.stdout.write(result.stdout);
}
console.log(`Inspección generada en ${output}`);

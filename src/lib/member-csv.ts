import { z } from "zod";

export type CsvMember = {
  fullName: string;
  shortName: string;
  carnet: string;
  email: string | null;
};

function rows(input: string) {
  const result: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index++;
      row.push(field.trim());
      if (row.some(Boolean)) result.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("Hay una comilla sin cerrar en el CSV.");
  row.push(field.trim());
  if (row.some(Boolean)) result.push(row);
  return result;
}

const email = z.union([z.literal(""), z.email()]);
const importedMember = z.object({
  fullName: z.string().trim().min(3).max(150),
  shortName: z.string().trim().min(2).max(50),
  carnet: z.string().trim().min(3).max(40),
  email: z.string().nullable(),
});
const aliases: Record<string, keyof CsvMember> = {
  nombre: "fullName",
  "nombre completo": "fullName",
  fullname: "fullName",
  "nombre corto": "shortName",
  nombre_corto: "shortName",
  shortname: "shortName",
  carnet: "carnet",
  carné: "carnet",
  email: "email",
  correo: "email",
};

export function parseMemberCsv(input: string): CsvMember[] {
  const parsedRows = rows(input.replace(/^\uFEFF/, ""));
  if (parsedRows.length < 2) throw new Error("Incluye encabezados y al menos un integrante.");
  const headers = parsedRows[0].map((header) => aliases[header.trim().toLocaleLowerCase("es")]);
  for (const required of ["fullName", "carnet"] as const)
    if (!headers.includes(required))
      throw new Error(`Falta la columna requerida: ${required === "fullName" ? "nombre" : "carnet"}.`);
  if (parsedRows.length > 201) throw new Error("Solo se permiten 200 integrantes por importación.");
  const seen = new Set<string>();
  return parsedRows.slice(1).map((values, index) => {
    const record: Partial<Record<keyof CsvMember, string>> = {};
    headers.forEach((header, column) => {
      if (header) record[header] = values[column]?.trim() ?? "";
    });
    const fullName = record.fullName ?? "";
    const carnet = record.carnet ?? "";
    if (fullName.length < 3 || carnet.length < 3)
      throw new Error(`La fila ${index + 2} necesita nombre y carné válidos.`);
    const normalizedCarnet = carnet.toLocaleLowerCase("es");
    if (seen.has(normalizedCarnet)) throw new Error(`El carné ${carnet} está repetido en el archivo.`);
    seen.add(normalizedCarnet);
    const parsedEmail = email.safeParse(record.email ?? "");
    if (!parsedEmail.success) throw new Error(`El correo de la fila ${index + 2} no es válido.`);
    const member = {
      fullName,
      shortName: record.shortName || fullName.split(/\s+/)[0].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""),
      carnet,
      email: parsedEmail.data || null,
    };
    const validMember = importedMember.safeParse(member);
    if (!validMember.success)
      throw new Error(`La fila ${index + 2} contiene un campo demasiado corto o largo.`);
    return validMember.data;
  });
}

import type { Allocation, Exercise, Member } from "./domain";

export type DistributionImageView = "matrix" | "member" | "section";
export type DistributionImageOptions = {
  view: DistributionImageView;
  includeDueDate: boolean;
  includeInstructions: boolean;
  includeTotal: boolean;
  includeWeight: boolean;
  size: "compact" | "normal" | "large";
  orientation: "vertical" | "horizontal";
  footer: string;
};
export type DistributionImageInput = {
  courseName: string;
  assignmentNumber: number;
  assignmentTitle: string;
  dueAt: string;
  instructions?: string | null;
  exercises: Exercise[];
  allocations: Allocation[];
  members: Member[];
  options: DistributionImageOptions;
};

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[character]!));

function wrap(value: string, limit: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of value.split(/\s+/)) {
    if (current && `${current} ${word}`.length > limit) {
      lines.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function assignedFor(memberId: string, input: DistributionImageInput) {
  const ids = new Set(input.allocations.filter((item) => item.memberId === memberId).map((item) => item.exerciseId));
  return input.exercises.filter((exercise) => ids.has(exercise.id));
}

type Table = { headers: string[]; rows: string[][]; title?: string };
function tables(input: DistributionImageInput): Table[] {
  const { options } = input;
  const sections = [...new Set(input.exercises.map((exercise) => exercise.section))];
  if (options.view === "member") {
    const headers = ["Integrante", "Asignaciones"];
    if (options.includeTotal) headers.push("Total");
    if (options.includeWeight) headers.push("Peso");
    return [{ headers, rows: input.members.map((member) => {
      const assigned = assignedFor(member.id, input);
      const grouped = sections.map((section) => {
        const labels = assigned.filter((item) => item.section === section).map((item) => item.label);
        return labels.length ? `${section}: ${labels.join(", ")}` : "";
      }).filter(Boolean).join(" | ") || "Sin ejercicios";
      const row: Array<string | number> = [member.name, grouped];
      if (options.includeTotal) row.push(assigned.length);
      if (options.includeWeight) row.push(assigned.reduce((sum, item) => sum + item.weight, 0));
      return row.map(String);
    }) }];
  }
  if (options.view === "section") {
    return sections.map((section) => ({
      title: `Sección ${section}`,
      headers: ["Ejercicio", "Integrante", ...(options.includeWeight ? ["Peso"] : [])],
      rows: input.exercises.filter((item) => item.section === section).map((exercise) => {
        const memberId = input.allocations.find((item) => item.exerciseId === exercise.id)?.memberId;
        const row = [exercise.label, input.members.find((member) => member.id === memberId)?.name ?? "Sin asignar"];
        if (options.includeWeight) row.push(String(exercise.weight));
        return row;
      }),
    }));
  }
  const perTable = options.orientation === "horizontal" ? 5 : 3;
  const chunks = Array.from({ length: Math.ceil(sections.length / perTable) }, (_, index) =>
    sections.slice(index * perTable, (index + 1) * perTable));
  return chunks.map((chunk) => {
    const headers = ["Integrante", ...chunk.map((section) => `Sección ${section}`)];
    if (options.includeTotal) headers.push("Total");
    if (options.includeWeight) headers.push("Peso");
    return {
      title: chunks.length > 1 ? `Matriz ${chunks.indexOf(chunk) + 1} de ${chunks.length}` : undefined,
      headers,
      rows: input.members.map((member) => {
        const assigned = assignedFor(member.id, input);
        const row: Array<string | number> = [member.name, ...chunk.map((section) =>
          assigned.filter((item) => item.section === section).map((item) => item.label).join(", ") || "-")];
        if (options.includeTotal) row.push(assigned.length);
        if (options.includeWeight) row.push(assigned.reduce((sum, item) => sum + item.weight, 0));
        return row.map(String);
      }),
    };
  });
}

export function distributionImageFileName(courseName: string, assignmentNumber: number) {
  const course = courseName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${course || "curso"}-tarea-${assignmentNumber}-distribucion.png`;
}

export function createDistributionSvg(input: DistributionImageInput) {
  const scale = input.options.size === "compact" ? 0.86 : input.options.size === "large" ? 1.18 : 1;
  const width = Math.round((input.options.orientation === "horizontal" ? 1600 : 1120) * scale);
  const margin = Math.round(56 * scale);
  const font = Math.round(22 * scale);
  const headerHeight = Math.round(190 * scale);
  const tableList = tables(input);
  const rendered: string[] = [];
  let y = headerHeight;
  for (const table of tableList) {
    if (table.title) {
      rendered.push(`<text x="${margin}" y="${y + font}" class="section-title">${escapeXml(table.title)}</text>`);
      y += Math.round(46 * scale);
    }
    const available = width - margin * 2;
    const nameWidth = Math.min(Math.round(320 * scale), Math.round(available * 0.3));
    const otherWidth = (available - nameWidth) / Math.max(1, table.headers.length - 1);
    const widths = table.headers.map((_, index) => index === 0 ? nameWidth : otherWidth);
    let x = margin;
    table.headers.forEach((header, index) => {
      rendered.push(`<rect x="${x}" y="${y}" width="${widths[index]}" height="${48 * scale}" class="th"/>`);
      rendered.push(`<text x="${x + 12 * scale}" y="${y + 31 * scale}" class="th-text">${escapeXml(header)}</text>`);
      x += widths[index];
    });
    y += 48 * scale;
    table.rows.forEach((row, rowIndex) => {
      const lines = row.map((cell, index) => wrap(cell, Math.max(8, Math.floor(widths[index] / (font * 0.55)))));
      const rowHeight = Math.max(54 * scale, (Math.max(...lines.map((item) => item.length)) * (font + 5) + 20) * scale);
      x = margin;
      row.forEach((_, index) => {
        rendered.push(`<rect x="${x}" y="${y}" width="${widths[index]}" height="${rowHeight}" class="td ${rowIndex % 2 ? "alt" : ""}"/>`);
        rendered.push(`<text x="${x + 12 * scale}" y="${y + 28 * scale}" class="td-text">${lines[index].map((line, lineIndex) => `<tspan x="${x + 12 * scale}" dy="${lineIndex ? font + 5 : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`);
        x += widths[index];
      });
      y += rowHeight;
    });
    y += 34 * scale;
  }
  const footerLines = input.options.includeInstructions && input.instructions?.trim()
    ? [input.instructions.trim(), input.options.footer]
    : [input.options.footer];
  const footerWrapped = footerLines.flatMap((line) => wrap(line, Math.floor((width - margin * 2) / (font * 0.5))));
  const height = Math.max(Math.round(720 * scale), Math.ceil(y + footerWrapped.length * (font + 6) + 70 * scale));
  const sections = [...new Set(input.exercises.map((exercise) => exercise.section))];
  const due = new Intl.DateTimeFormat("es-GT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Guatemala",
  }).format(new Date(input.dueAt));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>.title{font:700 ${34 * scale}px Arial,sans-serif;fill:#fff}.subtitle{font:600 ${23 * scale}px Arial,sans-serif;fill:#dcebe6}.meta{font:400 ${18 * scale}px Arial,sans-serif;fill:#31554b}.section-title{font:700 ${21 * scale}px Arial,sans-serif;fill:#173f34}.th{fill:#1f594a;stroke:#174538}.th-text{font:700 ${15 * scale}px Arial,sans-serif;fill:#fff}.td{fill:#fff;stroke:#b9ccc5}.td.alt{fill:#f3f7f5}.td-text{font:400 ${font}px Arial,sans-serif;fill:#17231f}.footer{font:400 ${17 * scale}px Arial,sans-serif;fill:#4c625b}</style>
  <rect width="100%" height="100%" fill="#f7faf8"/><rect width="100%" height="${125 * scale}" fill="#173f34"/>
  <text x="${margin}" y="${52 * scale}" class="title">DISTRIBUCIÓN DE EJERCICIOS</text>
  <text x="${margin}" y="${91 * scale}" class="subtitle">${escapeXml(input.courseName)} - Tarea ${input.assignmentNumber}: ${escapeXml(input.assignmentTitle)}</text>
  <text x="${margin}" y="${151 * scale}" class="meta">Secciones: ${escapeXml(sections.join(", "))}${input.options.includeDueDate ? `  |  Fecha límite: ${escapeXml(due)}` : ""}</text>
  ${rendered.join("\n")}
  ${footerWrapped.map((line, index) => `<text x="${margin}" y="${height - (footerWrapped.length - index) * (font + 6) - 18 * scale}" class="footer">${escapeXml(line)}</text>`).join("\n")}
  </svg>`;
}

export async function svgToPng(svg: string) {
  const source = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar el lienzo PNG.");
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("No se pudo generar el PNG.")), "image/png",
    ));
  } finally { URL.revokeObjectURL(url); }
}

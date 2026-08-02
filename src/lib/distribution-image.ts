import { zipSync } from "fflate";
import type { Allocation, Exercise, Member } from "./domain";

export type DistributionImageView = "summary" | "cards" | "matrix";
export type DistributionImageOptions = {
  view: DistributionImageView;
  includeDueDate: boolean;
  includeInstructions: boolean;
  includeTotal: boolean;
  includeWeight: boolean;
  size: "whatsapp" | "high";
  nameMode: "full" | "short";
  primaryColor: string;
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
export type DistributionImagePage = {
  svg: string;
  filename: string;
  width: number;
  height: number;
  memberId?: string;
  part: number;
  parts: number;
};

const DEFAULT_FOOTER = "Resolver todos los ejercicios mostrando el procedimiento completo y enviar en un PDF legible.";
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[character]!));
const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function wrapTokens(value: string, maxCharacters: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && `${current} ${word}`.length > maxCharacters) {
      lines.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function memberData(member: Member, input: DistributionImageInput) {
  const ids = new Set(input.allocations.filter((item) => item.memberId === member.id).map((item) => item.exerciseId));
  const assigned = input.exercises.filter((exercise) => ids.has(exercise.id));
  const sections = [...new Set(input.exercises.map((exercise) => exercise.section))];
  return {
    member,
    assigned,
    groups: sections.map((section) => ({
      section,
      labels: assigned.filter((exercise) => exercise.section === section).map((exercise) => exercise.label),
    })).filter((group) => group.labels.length),
    weight: assigned.reduce((sum, exercise) => sum + exercise.weight, 0),
  };
}

function dueText(dueAt: string) {
  return new Intl.DateTimeFormat("es-GT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "America/Guatemala",
  }).format(new Date(dueAt)).replace(",", " —");
}

function textLines(lines: string[], x: number, y: number, className: string, lineHeight: number) {
  return `<text x="${x}" y="${y}" class="${className}">${lines.map((line, index) =>
    `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

function chrome(input: DistributionImageInput, width: number, height: number, body: string, compact = false, part?: string) {
  const scale = width / 1080;
  const margin = Math.round(64 * scale);
  const color = /^#[0-9a-f]{6}$/i.test(input.options.primaryColor) ? input.options.primaryColor : "#17624f";
  const sections = [...new Set(input.exercises.map((exercise) => exercise.section))];
  const task = `${input.courseName} — Tarea ${input.assignmentNumber}${input.assignmentTitle ? `: ${input.assignmentTitle}` : ""}`;
  const meta = [
    `Secciones ${sections.join(", ")}`,
    ...(input.options.includeDueDate ? [`Entrega: ${dueText(input.dueAt)}`] : []),
    `Integrantes: ${input.members.length}`,
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .title{font:700 ${Math.round((compact ? 35 : 42) * scale)}px Arial,sans-serif;letter-spacing:${Math.round(1.2 * scale)}px;fill:#fff}
    .subtitle{font:600 ${Math.round((compact ? 27 : 30) * scale)}px Arial,sans-serif;fill:#eaf7f2}
    .meta{font:400 ${Math.round(23 * scale)}px Arial,sans-serif;fill:#31584d}
    .name{font:700 ${Math.round(30 * scale)}px Arial,sans-serif;fill:#17251f}
    .label{font:700 ${Math.round(25 * scale)}px Arial,sans-serif;fill:${color}}
    .value{font:400 ${Math.round(25 * scale)}px Arial,sans-serif;fill:#263c35}
    .total{font:700 ${Math.round(24 * scale)}px Arial,sans-serif;fill:#233b33}
    .footer{font:400 ${Math.round(21 * scale)}px Arial,sans-serif;fill:#425c54}
    .matrix-head{font:700 ${Math.round(18 * scale)}px Arial,sans-serif;fill:#fff}
    .matrix-text{font:400 ${Math.round(18 * scale)}px Arial,sans-serif;fill:#263c35}
  </style>
  <rect width="100%" height="100%" fill="#f5f9f7"/>
  <rect width="100%" height="${Math.round((compact ? 112 : 132) * scale)}" fill="${color}"/>
  <text x="${margin}" y="${Math.round((compact ? 54 : 61) * scale)}" class="title">DISTRIBUCIÓN DE EJERCICIOS</text>
  <text x="${margin}" y="${Math.round((compact ? 94 : 105) * scale)}" class="subtitle">${escapeXml(task)}${part ? ` — ${escapeXml(part)}` : ""}</text>
  ${compact ? "" : textLines(meta, margin, Math.round(174 * scale), "meta", Math.round(34 * scale))}
  ${body}
  </svg>`;
}

function summaryPages(input: DistributionImageInput): DistributionImagePage[] {
  const width = input.options.size === "high" ? 1600 : 1080;
  const scale = width / 1080;
  const margin = Math.round(64 * scale);
  const contentWidth = width - margin * 2;
  const maxHeight = Math.round((input.options.size === "high" ? 2800 : 1920));
  const lineHeight = Math.round(35 * scale);
  const memberGap = Math.round(24 * scale);
  const labelX = margin + Math.round(28 * scale);
  const valueX = margin + Math.round(154 * scale);
  const valueChars = Math.max(24, Math.floor((contentWidth - (valueX - margin) - 28 * scale) / (14 * scale)));
  const data = input.members.map((member) => memberData(member, input));
  const blocks = data.map((item) => {
    const name = input.options.nameMode === "full" ? item.member.name : item.member.shortName;
    const nameLines = wrapTokens(name, 56);
    const groups = item.groups.map((group) => ({ ...group, lines: wrapTokens(group.labels.join(", "), valueChars) }));
    const totals = (input.options.includeTotal ? 1 : 0) + (input.options.includeWeight ? 1 : 0);
    const height = Math.round(38 * scale) + nameLines.length * lineHeight + groups.reduce((sum, group) => sum + Math.max(1, group.lines.length) * lineHeight + 12 * scale, 0) + totals * lineHeight + Math.round(28 * scale);
    return { ...item, nameLines, groups, height };
  });
  const firstTop = Math.round(272 * scale);
  const continuedTop = Math.round(178 * scale);
  const footerText = input.options.footer.trim() || DEFAULT_FOOTER;
  const footerSource = [
    ...(input.options.includeInstructions && input.instructions?.trim() ? [input.instructions.trim()] : []),
    ...(input.options.includeInstructions ? [footerText] : []),
  ];
  const footerLines = footerSource.flatMap((line) => wrapTokens(line, 82));
  const footerHeight = footerLines.length ? footerLines.length * Math.round(30 * scale) + Math.round(62 * scale) : Math.round(24 * scale);
  const pageBlocks: typeof blocks[] = [];
  let current: typeof blocks = [];
  let used = firstTop;
  for (const block of blocks) {
    const reserved = footerHeight + margin;
    if (current.length && used + block.height + memberGap + reserved > maxHeight) {
      pageBlocks.push(current);
      current = [];
      used = continuedTop;
    }
    current.push(block);
    used += block.height + memberGap;
  }
  if (current.length || !pageBlocks.length) pageBlocks.push(current);
  const base = `${slug(input.courseName) || "curso"}-tarea-${input.assignmentNumber}-distribucion`;
  return pageBlocks.map((items, pageIndex) => {
    const top = pageIndex ? continuedTop : firstTop;
    let y = top;
    const rendered: string[] = [];
    for (const item of items) {
      rendered.push(`<rect x="${margin}" y="${y}" width="${contentWidth}" height="${item.height}" rx="${Math.round(18 * scale)}" fill="#fff" stroke="#c9d9d3" stroke-width="${Math.max(1, Math.round(2 * scale))}"/>`);
      y += Math.round(42 * scale);
      rendered.push(textLines(item.nameLines, labelX, y, "name", lineHeight));
      y += item.nameLines.length * lineHeight + Math.round(15 * scale);
      for (const group of item.groups) {
        rendered.push(`<text x="${labelX}" y="${y}" class="label">${escapeXml(group.section)}:</text>`);
        rendered.push(textLines(group.lines, valueX, y, "value", lineHeight));
        y += group.lines.length * lineHeight + Math.round(12 * scale);
      }
      if (input.options.includeTotal) {
        rendered.push(`<text x="${labelX}" y="${y}" class="total">Total: ${item.assigned.length} ejercicio${item.assigned.length === 1 ? "" : "s"}</text>`);
        y += lineHeight;
      }
      if (input.options.includeWeight) {
        rendered.push(`<text x="${labelX}" y="${y}" class="total">Peso total: ${item.weight}</text>`);
        y += lineHeight;
      }
      y += Math.round(34 * scale);
    }
    if (footerLines.length) {
      y += Math.round(12 * scale);
      rendered.push(`<line x1="${margin}" y1="${y}" x2="${width - margin}" y2="${y}" stroke="#bed0c9"/>`);
      y += Math.round(42 * scale);
      rendered.push(textLines(footerLines, margin, y, "footer", Math.round(30 * scale)));
      y += footerLines.length * Math.round(30 * scale) + Math.round(28 * scale);
    }
    const height = Math.max(Math.round(720 * scale), Math.ceil(y + margin));
    const part = pageBlocks.length > 1 ? `Parte ${pageIndex + 1} de ${pageBlocks.length}` : undefined;
    return {
      svg: chrome(input, width, height, rendered.join("\n"), pageIndex > 0, part),
      filename: pageBlocks.length > 1 ? `${base}-parte-${pageIndex + 1}.png` : `${base}.png`,
      width, height, part: pageIndex + 1, parts: pageBlocks.length,
    };
  });
}

function cardPages(input: DistributionImageInput): DistributionImagePage[] {
  const cardInput = { ...input, options: { ...input.options, includeInstructions: true } };
  return input.members.map((member, index) => {
    const page = summaryPages({ ...cardInput, members: [member] })[0];
    const name = input.options.nameMode === "full" ? member.name : member.shortName;
    return { ...page, filename: `${slug(input.courseName) || "curso"}-tarea-${input.assignmentNumber}-${slug(name) || `integrante-${index + 1}`}.png`, memberId: member.id, part: index + 1, parts: input.members.length };
  });
}

function matrixPage(input: DistributionImageInput): DistributionImagePage {
  const width = input.options.size === "high" ? 1920 : 1440;
  const scale = width / 1080;
  const margin = Math.round(44 * scale);
  const sections = [...new Set(input.exercises.map((exercise) => exercise.section))];
  const columns = ["Integrante", ...sections, ...(input.options.includeTotal ? ["Total"] : []), ...(input.options.includeWeight ? ["Peso"] : [])];
  const nameWidth = Math.round(245 * scale);
  const otherWidth = (width - margin * 2 - nameWidth) / Math.max(1, columns.length - 1);
  const widths = columns.map((_, index) => index ? otherWidth : nameWidth);
  const rows = input.members.map((member) => {
    const data = memberData(member, input);
    return [input.options.nameMode === "full" ? member.name : member.shortName,
      ...sections.map((section) => data.groups.find((group) => group.section === section)?.labels.join(", ") || "—"),
      ...(input.options.includeTotal ? [String(data.assigned.length)] : []), ...(input.options.includeWeight ? [String(data.weight)] : [])];
  });
  const top = Math.round(250 * scale);
  const headerHeight = Math.round(52 * scale);
  const font = Math.round(18 * scale);
  const wrapped = rows.map((row) => row.map((cell, index) => wrapTokens(cell, Math.max(8, Math.floor(widths[index] / (font * .55))))));
  const rowHeights = wrapped.map((row) => Math.max(Math.round(58 * scale), Math.max(...row.map((lines) => lines.length)) * Math.round(25 * scale) + Math.round(22 * scale)));
  const height = Math.max(Math.round(720 * scale), top + headerHeight + rowHeights.reduce((sum, item) => sum + item, 0) + margin * 2);
  const rendered: string[] = [];
  let y = top;
  let x = margin;
  columns.forEach((column, index) => {
    rendered.push(`<rect x="${x}" y="${y}" width="${widths[index]}" height="${headerHeight}" fill="${input.options.primaryColor}" stroke="#164c3f"/><text x="${x + 12 * scale}" y="${y + 33 * scale}" class="matrix-head">${escapeXml(column)}</text>`);
    x += widths[index];
  });
  y += headerHeight;
  wrapped.forEach((row, rowIndex) => {
    x = margin;
    row.forEach((lines, index) => {
      rendered.push(`<rect x="${x}" y="${y}" width="${widths[index]}" height="${rowHeights[rowIndex]}" fill="${rowIndex % 2 ? "#f0f6f3" : "#fff"}" stroke="#bfd0ca"/>`);
      rendered.push(textLines(lines, x + 12 * scale, y + 28 * scale, "matrix-text", Math.round(25 * scale)));
      x += widths[index];
    });
    y += rowHeights[rowIndex];
  });
  return { svg: chrome(input, width, height, rendered.join("\n")), filename: `${slug(input.courseName) || "curso"}-tarea-${input.assignmentNumber}-matriz-clasica.png`, width, height, part: 1, parts: 1 };
}

export function createDistributionImages(input: DistributionImageInput): DistributionImagePage[] {
  if (input.options.view === "cards") return cardPages(input);
  if (input.options.view === "matrix") return [matrixPage(input)];
  return summaryPages(input);
}

/** Compatibilidad para consumidores existentes: devuelve la primera página. */
export function createDistributionSvg(input: DistributionImageInput) {
  return createDistributionImages(input)[0]?.svg ?? "";
}

export function distributionImageFileName(courseName: string, assignmentNumber: number) {
  return `${slug(courseName) || "curso"}-tarea-${assignmentNumber}-distribucion.png`;
}

export async function svgToPng(svg: string) {
  if (!svg.trim().startsWith("<svg")) throw new Error("La imagen SVG está vacía.");
  if (typeof document !== "undefined" && "fonts" in document) await document.fonts.ready;
  const source = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("La imagen generada no tiene dimensiones válidas.");
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar el lienzo PNG.");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("No se pudo generar el PNG.")), "image/png",
    ));
    if (blob.type !== "image/png" || blob.size < 100) throw new Error("El PNG generado no es válido.");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function pngZip(files: Array<{ filename: string; bytes: Uint8Array }>) {
  const archive = zipSync(Object.fromEntries(files.map((file) => [file.filename, file.bytes])), { level: 6 });
  return new Blob([archive as BlobPart], { type: "application/zip" });
}

export function imageExportCapabilities(navigatorValue: Pick<Navigator, "clipboard" | "share" | "canShare"> | undefined) {
  return {
    clipboard: Boolean(typeof window !== "undefined" && typeof window.ClipboardItem === "function" && navigatorValue?.clipboard?.write),
    share: Boolean(navigatorValue?.share && navigatorValue?.canShare),
  };
}

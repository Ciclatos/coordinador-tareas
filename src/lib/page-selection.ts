export function parsePageSelection(input: string, pageCount?: number) {
  const value = input.trim();
  if (!value) return undefined;
  const selected = new Set<number>();
  for (const token of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    const match = token.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error(`Selección de páginas inválida: ${token}.`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end - start > 500)
      throw new Error(`Rango de páginas inválido: ${token}.`);
    for (let page = start; page <= end; page++) {
      if (pageCount && page > pageCount)
        throw new Error(`La página ${page} no existe en el documento.`);
      selected.add(page - 1);
    }
  }
  return [...selected].sort((left, right) => left - right);
}

export function formatPageSelection(pages?: number[]) {
  return pages?.map((page) => page + 1).join(", ") ?? "";
}

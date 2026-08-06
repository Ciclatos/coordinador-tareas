import { naturalCompare } from "./domain";

export type SectionSelection = "range" | "odd" | "even" | "multiple" | "manual";

export type SectionConfig = {
  id: string;
  name: string;
  selection: SectionSelection;
  start: number;
  end: number | null;
  interval: number;
  manualList: string;
  exclusions: string;
  inclusions: string;
  labels: string[];
  defaultWeight: number;
  notes: string;
};

export const emptySection = (
  id: string,
  name = "Sección 1",
): SectionConfig => ({
  id,
  name,
  selection: "range",
  start: 1,
  end: null,
  interval: 1,
  manualList: "",
  exclusions: "",
  inclusions: "",
  labels: [],
  defaultWeight: 1,
  notes: "",
});

export function parseLabelList(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function duplicateLabels(value: string) {
  const seen = new Set<string>();
  return [
    ...new Set(
      parseLabelList(value).filter((item) => seen.has(item) || !seen.add(item)),
    ),
  ];
}

export function generateSectionLabels(section: SectionConfig) {
  if (section.selection === "manual")
    return [...new Set(parseLabelList(section.manualList))].sort(
      naturalCompare,
    );
  if (!sectionRangeValid(section))
    throw new Error("El rango inicial y final no es válido.");
  const end = section.end as number;
  if (end - section.start > 1000)
    throw new Error("El rango no puede superar 1000 posiciones.");
  if (!Number.isInteger(section.interval) || section.interval < 1)
    throw new Error("El intervalo o múltiplo debe ser mayor que cero.");
  const excluded = new Set(parseLabelList(section.exclusions));
  const included = parseLabelList(section.inclusions);
  const generated = Array.from(
    { length: end - section.start + 1 },
    (_, index) => section.start + index,
  )
    .filter(
      (value) =>
        (section.selection === "range" &&
          (value - section.start) % section.interval === 0) ||
        (section.selection === "odd" && value % 2 === 1) ||
        (section.selection === "even" && value % 2 === 0) ||
        (section.selection === "multiple" && value % section.interval === 0),
    )
    .map(String)
    .filter((label) => !excluded.has(label));
  return [...new Set([...generated, ...included])].sort(naturalCompare);
}

export function sectionRangeValid(section: SectionConfig) {
  return (
    section.selection === "manual" ||
    (Number.isInteger(section.start) &&
      Number.isInteger(section.end) &&
      section.end !== null &&
      section.start <= section.end)
  );
}

export function sectionRule(
  section: SectionConfig,
  mode: string,
  seed: string,
) {
  return {
    version: 2,
    mode,
    seed,
    selection: section.selection,
    start: section.start,
    end: section.end,
    interval: section.interval,
    manualList: section.manualList,
    exclusions: section.exclusions,
    inclusions: section.inclusions,
  };
}

export function sectionFromStored(input: {
  id: string;
  name: string;
  rule: unknown;
  notes?: string | null;
  defaultWeight?: number | null;
  labels: string[];
}): SectionConfig {
  const fallback = emptySection(input.id, input.name);
  const rule =
    input.rule && typeof input.rule === "object"
      ? (input.rule as Record<string, unknown>)
      : {};
  const selection = ["range", "odd", "even", "multiple", "manual"].includes(
    String(rule.selection),
  )
    ? (rule.selection as SectionSelection)
    : input.labels.length
      ? "manual"
      : fallback.selection;
  return {
    ...fallback,
    selection,
    start: typeof rule.start === "number" ? rule.start : fallback.start,
    end: typeof rule.end === "number" ? rule.end : fallback.end,
    interval:
      typeof rule.interval === "number" ? rule.interval : fallback.interval,
    manualList:
      typeof rule.manualList === "string"
        ? rule.manualList
        : selection === "manual"
          ? input.labels.join(", ")
          : "",
    exclusions: typeof rule.exclusions === "string" ? rule.exclusions : "",
    inclusions: typeof rule.inclusions === "string" ? rule.inclusions : "",
    labels: input.labels,
    defaultWeight: input.defaultWeight ?? 1,
    notes: input.notes ?? "",
  };
}

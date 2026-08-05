export const GUATEMALA_TIME_ZONE = "America/Guatemala";

/** Convierte el valor sin zona de <input type="datetime-local"> a un instante UTC. */
export function parseGuatemalaDateTimeLocal(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value !== "string") return new Date(Number.NaN);
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(normalized))
    return new Date(Number.NaN);
  return new Date(`${normalized.length === 16 ? `${normalized}:00` : normalized}-06:00`);
}

/** Convierte un instante UTC al valor local que espera datetime-local. */
export function formatGuatemalaDateTimeLocal(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GUATEMALA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

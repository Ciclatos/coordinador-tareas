export type PdfQualityProfile = "high" | "balanced" | "compact";

export const pdfQualityProfiles = {
  high: {
    label: "Alta",
    maxDimension: 2400,
    jpegQuality: 0.9,
    targetDpi: 200,
    estimatedRatio: 0.88,
  },
  balanced: {
    label: "Equilibrada",
    maxDimension: 1800,
    jpegQuality: 0.78,
    targetDpi: 165,
    estimatedRatio: 0.62,
  },
  compact: {
    label: "Compacta",
    maxDimension: 1200,
    jpegQuality: 0.62,
    targetDpi: 120,
    estimatedRatio: 0.4,
  },
} as const satisfies Record<PdfQualityProfile, {
  label: string;
  maxDimension: number;
  jpegQuality: number;
  targetDpi: number;
  estimatedRatio: number;
}>;

export function estimatePdfBytes(
  sourcesBytes: number,
  profile: PdfQualityProfile,
  administrativeBytes = 90_000,
) {
  if (!Number.isFinite(sourcesBytes) || sourcesBytes <= 0)
    return administrativeBytes;
  return Math.max(
    administrativeBytes,
    Math.round(sourcesBytes * pdfQualityProfiles[profile].estimatedRatio + administrativeBytes),
  );
}

export function reductionPercent(sourceBytes: number, resultBytes: number) {
  if (sourceBytes <= 0 || resultBytes >= sourceBytes) return 0;
  return Math.round((1 - resultBytes / sourceBytes) * 100);
}

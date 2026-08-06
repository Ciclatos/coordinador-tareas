import { describe, expect, it } from "vitest";
import { submissionDataIssue } from "./submission-dto";

describe("DTO tolerante de entregas", () => {
  it("acepta pendiente sin versiones y estados completos", () => {
    expect(
      submissionDataIssue({ status: "PENDING", versionCount: 0 }),
    ).toBeNull();
    for (const status of [
      "SUBMITTED",
      "APPROVED",
      "REJECTED",
      "NEEDS_CORRECTION",
      "LATE",
    ])
      expect(
        submissionDataIssue({
          status,
          versionCount: 2,
          currentVersion: { files: [{}] },
        }),
      ).toBeNull();
  });
  it("aísla datos heredados incompletos", () => {
    expect(
      submissionDataIssue({ status: "REJECTED", versionCount: 0 }),
    ).toMatch(/no tiene archivos/i);
    expect(
      submissionDataIssue({ status: "APPROVED", versionCount: 1 }),
    ).toMatch(/versión actual/i);
    expect(
      submissionDataIssue({
        status: "SUBMITTED",
        versionCount: 1,
        currentVersion: { files: [] },
      }),
    ).toMatch(/no contiene archivos/i);
  });
});

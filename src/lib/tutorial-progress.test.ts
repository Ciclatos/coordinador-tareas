import { describe, expect, it } from "vitest";
import {
  shouldAutoStartTutorial,
  tutorialStatusLabel,
  type TutorialProgressDto,
} from "./tutorial-progress";

const progress = (
  tutorialKey: TutorialProgressDto["tutorialKey"],
  status: TutorialProgressDto["status"],
  tutorialVersion = 1,
): TutorialProgressDto => ({
  tutorialKey,
  status,
  tutorialVersion,
  currentStep: null,
});
describe("progreso de tutoriales", () => {
  it("muestra el general solo a una cuenta nueva sin progreso", () => {
    expect(
      shouldAutoStartTutorial({
        key: "general",
        eligible: true,
        generalActive: false,
        generalFinishedThisSession: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoStartTutorial({
        key: "general",
        eligible: false,
        generalActive: false,
        generalFinishedThisSession: false,
      }),
    ).toBe(false);
  });
  it.each(["COMPLETED", "SKIPPED"] as const)(
    "no repite automáticamente un tutorial %s",
    (status) => {
      const item = progress("general", status);
      expect(
        shouldAutoStartTutorial({
          key: "general",
          eligible: true,
          progress: item,
          generalProgress: item,
          generalActive: false,
          generalFinishedThisSession: false,
        }),
      ).toBe(false);
    },
  );
  it("mantiene independientes los contextuales y bloquea solapamientos", () => {
    const general = progress("general", "COMPLETED");
    expect(
      shouldAutoStartTutorial({
        key: "courses",
        eligible: true,
        generalProgress: general,
        generalActive: false,
        generalFinishedThisSession: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoStartTutorial({
        key: "courses",
        eligible: true,
        generalProgress: general,
        generalActive: true,
        generalFinishedThisSession: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoStartTutorial({
        key: "courses",
        eligible: true,
        generalProgress: general,
        generalActive: false,
        generalFinishedThisSession: true,
      }),
    ).toBe(false);
  });
  it("detecta versiones y etiquetas de estado", () => {
    expect(progress("courses", "COMPLETED", 1).tutorialVersion).toBe(1);
    expect(tutorialStatusLabel("IN_PROGRESS")).toBe("En progreso");
    expect(tutorialStatusLabel()).toBe("No visto");
  });
});

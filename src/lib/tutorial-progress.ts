import type { TutorialKey } from "@/tutorials/tutorialDefinitions";

export type TutorialProgressDto = {
  tutorialKey: TutorialKey;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
  currentStep: number | null;
  tutorialVersion: number;
};

export function shouldAutoStartTutorial(input: {
  key: TutorialKey;
  eligible: boolean;
  progress?: TutorialProgressDto;
  generalProgress?: TutorialProgressDto;
  generalActive: boolean;
  generalFinishedThisSession: boolean;
}) {
  if (input.generalActive) return false;
  if (input.key === "general") return input.eligible && !input.progress;
  if (input.generalFinishedThisSession) return false;
  if (
    !input.generalProgress ||
    !["COMPLETED", "SKIPPED"].includes(input.generalProgress.status)
  )
    return false;
  return !input.progress;
}

export function tutorialStatusLabel(status?: TutorialProgressDto["status"]) {
  return (
    {
      NOT_STARTED: "No visto",
      IN_PROGRESS: "En progreso",
      COMPLETED: "Completado",
      SKIPPED: "Omitido",
    } as const
  )[status ?? "NOT_STARTED"];
}

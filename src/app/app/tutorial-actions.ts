"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  tutorialDefinitions,
  tutorialKeys,
} from "@/tutorials/tutorialDefinitions";

const keySchema = z.enum(tutorialKeys);
const actionSchema = z.object({
  key: keySchema,
  action: z.enum(["START", "STEP", "COMPLETE", "SKIP", "RESET"]),
  currentStep: z.number().int().min(0).max(100).optional(),
  replay: z.boolean().optional(),
});

export async function updateTutorialProgress(
  input: z.input<typeof actionSchema>,
) {
  const { userId } = await requireSession();
  const data = actionSchema.parse(input);
  const definition = tutorialDefinitions[data.key];
  const previous = await prisma.userTutorialProgress.findUnique({
    where: { userId_tutorialKey: { userId, tutorialKey: data.key } },
  });
  if (data.action === "RESET") {
    await prisma.userTutorialProgress.deleteMany({
      where: { userId, tutorialKey: data.key },
    });
  } else {
    const preserveTerminal = Boolean(
      previous &&
        ((["COMPLETED", "SKIPPED"].includes(previous.status) &&
          ["START", "STEP"].includes(data.action)) ||
          (data.replay &&
            previous.status === "COMPLETED" &&
            data.action === "SKIP")),
    );
    const status = preserveTerminal
      ? previous!.status
      : data.action === "COMPLETE"
        ? "COMPLETED"
        : data.action === "SKIP"
          ? "SKIPPED"
          : "IN_PROGRESS";
    const now = new Date();
    await prisma.userTutorialProgress.upsert({
      where: { userId_tutorialKey: { userId, tutorialKey: data.key } },
      create: {
        userId,
        tutorialKey: data.key,
        tutorialVersion: definition.version,
        status,
        currentStep: data.action === "STEP" ? (data.currentStep ?? 0) : null,
        startedAt: now,
        completedAt: data.action === "COMPLETE" ? now : null,
        skippedAt: data.action === "SKIP" ? now : null,
      },
      update: {
        tutorialVersion: definition.version,
        status,
        currentStep: data.action === "STEP" ? (data.currentStep ?? 0) : null,
        completedAt: data.action === "COMPLETE" ? now : previous?.completedAt,
        skippedAt: data.action === "SKIP" ? now : previous?.skippedAt,
      },
    });
  }
  revalidatePath("/app");
  return { ok: true };
}

export async function resetAllTutorials() {
  const { userId } = await requireSession();
  await prisma.userTutorialProgress.deleteMany({ where: { userId } });
  revalidatePath("/app");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cleanupOrphanBlobs, getStorageSnapshot } from "@/lib/storage-management";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

async function canManageStorage(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return false;
  const configured = (process.env.STORAGE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length) return configured.includes(user.email.toLowerCase());
  const owner = await prisma.user.findFirst({
    where: { email: { not: { endsWith: "@example.com" } } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return owner?.id === userId;
}

export async function loadStorageSnapshot() {
  const { userId } = await requireSession();
  const [snapshot, canManage] = await Promise.all([
    getStorageSnapshot(),
    canManageStorage(userId),
  ]);
  return { snapshot, canManage };
}

const cleanupSchema = z.object({
  scope: z.enum(["orphans", "qa"]),
  confirmation: z.literal("LIMPIAR ALMACENAMIENTO"),
});

export async function runStorageCleanup(input: {
  scope: "orphans" | "qa";
  confirmation: string;
}) {
  const { userId } = await requireSession();
  if (!(await canManageStorage(userId)))
    return { ok: false as const, message: "No tiene permisos para ejecutar esta limpieza." };
  const parsed = cleanupSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, message: "La confirmación no coincide." };
  const result = await cleanupOrphanBlobs({ qaOnly: parsed.data.scope === "qa" });
  revalidatePath("/app");
  return {
    ok: true as const,
    message: `Se eliminaron ${result.deletedCount} archivos sin referencias válidas.`,
    ...result,
  };
}

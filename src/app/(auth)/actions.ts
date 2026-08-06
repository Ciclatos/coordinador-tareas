"use server";
import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/session";
import { loginSchema, registerSchema, type AuthState } from "@/lib/validation";
export async function register(
  _: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  if (
    await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    })
  )
    return { message: "Ya existe una cuenta con este correo." };
  const passwordHash = await hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      passwordHash,
      tutorialEligible: true,
      profile: { create: { name: parsed.data.name } },
    },
    select: { id: true },
  });
  await createSession(user.id);
  redirect("/app");
}
export async function login(
  _: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  });
  if (
    !user?.passwordHash ||
    !(await compare(parsed.data.password, user.passwordHash))
  )
    return { message: "Correo o contraseña incorrectos." };
  await createSession(user.id);
  redirect("/app");
}
export async function logout() {
  await deleteSession();
  redirect("/ingresar");
}

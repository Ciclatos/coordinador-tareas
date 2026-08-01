import { z } from "zod";
export const registerSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre completo").max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Escribe un correo válido")),
  password: z
    .string()
    .min(10, "Usa al menos 10 caracteres")
    .max(128)
    .regex(/[a-záéíóúñ]/i, "Incluye una letra")
    .regex(/\d/, "Incluye un número"),
});
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Escribe un correo válido")),
  password: z.string().min(1, "Escribe tu contraseña").max(128),
});
export type AuthState =
  { message?: string; errors?: Record<string, string[]> } | undefined;

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const email = process.env.SEED_DEMO_EMAIL;
const password = process.env.SEED_DEMO_PASSWORD;
if (!email || !password) {
  console.log("Seed omitido: define SEED_DEMO_EMAIL y SEED_DEMO_PASSWORD para crear datos ficticios.");
  await prisma.$disconnect();
  process.exit(0);
}
if (password.length < 10) throw new Error("SEED_DEMO_PASSWORD debe tener al menos 10 caracteres");
const passwordHash = await hash(password, 12);
const user = await prisma.user.upsert({ where: { email }, update: { passwordHash }, create: { email, passwordHash, profile: { create: { name: "Coordinador Demo", university: "Universidad de Demostración", faculty: "Facultad de Ingeniería", campus: "Campus Central", shift: "Vespertina", degree: "Ingeniería en Sistemas" } } } });
const existing = await prisma.course.findFirst({ where: { userId: user.id, code: "MAT-101" } });
if (!existing) {
  await prisma.course.create({ data: { userId: user.id, name: "Matemática Discreta", code: "MAT-101", teacher: "Docente de Ejemplo", degree: "Ingeniería en Sistemas", faculty: "Facultad de Ingeniería", university: "Universidad de Demostración", campus: "Campus Central", shift: "Vespertina", cycle: "2", semester: "2", section: "A", groupNumber: "2", academicYear: 2026, members: { create: ["Ana Lucía Pérez","Diego Mateo López","Sofía Isabel García","Mateo Andrés Ruiz","Valeria Fernanda Díaz","Daniel Alejandro Paz"].map((fullName, index) => ({ fullName, shortName: fullName.split(" ")[0], carnet: `DEMO-2026-${String(index + 1).padStart(3,"0")}`, sortOrder: index })) }, templates: { create: { name: "Evaluación semanal", criteria: { create: ["Puntualidad","Presentación PDF","Trabajo en equipo","Comunicación","Ejercicios completos"].map((name, index) => ({ name, maxScore: 20, sortOrder: index })) } } } } });
}
console.log("Seed ficticio completado.");
await prisma.$disconnect();

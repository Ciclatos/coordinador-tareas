# Coordinador de Tareas

Aplicación web en español para coordinar tareas grupales universitarias: define secciones y ejercicios, distribuye la carga considerando el historial, recibe archivos, registra evaluaciones y compila un PDF final tamaño carta.

## Enlaces

- Producción: [coordinador-tareas.vercel.app](https://coordinador-tareas.vercel.app)
- Repositorio: [github.com/Ciclatos/coordinador-tareas](https://github.com/Ciclatos/coordinador-tareas)

## Funcionalidad

- Dashboard responsive con progreso y estados de la tarea.
- Cursos, integrantes, tareas semanales y configuración localizada para Guatemala.
- Generador de rangos, pares, impares, múltiplos y listas alfanuméricas.
- Identidad de ejercicio compuesta por sección y etiqueta, de modo que `5.3:5` y `5.4:5` son diferentes.
- Distribución híbrida determinista: considera saldo histórico, rotación por sección, pesos, exclusiones y asignaciones bloqueadas.
- Matriz editable para mover ejercicios entre integrantes.
- Entregas PDF, JPG, PNG y WEBP en Vercel Blob privado, con validación binaria, SHA-256, versiones y acceso autenticado.
- Evaluación rápida con rúbricas configurables por curso, máximos dinámicos, motivos de reducción, comentarios y plantillas versionadas.
- Reporte determinista persistido, regenerable desde datos actuales y editable, sin depender de una API de IA.
- PDF final mediante `pdf-lib`: portada, desempeño, evaluación detallada, resumen, carátula con logo, integrantes, entregas y numeración. Incluye miniaturas PDF.js, selección de páginas, rotación, recorte de imágenes, drag and drop, compresión y versiones privadas descargables.
- Autenticación por correo y contraseña, sesiones firmadas y persistencia multiusuario en Lakebase Postgres (Neon) mediante Prisma.

## Arquitectura

La interfaz usa Next.js App Router y TypeScript estricto. `src/lib/domain.ts` contiene reglas puras y testeables; `src/lib/pdf.ts` compone el documento en el navegador para evitar límites de memoria serverless; Prisma persiste los modelos en Lakebase Postgres. Las rutas de servidor comprueban la sesión y la propiedad del curso antes de operar. Las cargas van directamente del navegador a Blob mediante un token limitado y después se verifican y registran en una transacción.

## Desarrollo local

Requisitos: Node.js 20.9 o posterior y npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abre `http://localhost:3000` y crea una cuenta. El seed opcional usa únicamente nombres ficticios.

## Base de datos y almacenamiento

1. Crea una base Lakebase Postgres/Neon y completa `DATABASE_URL` (pooled) y `DATABASE_URL_UNPOOLED` (directa).
2. Genera `AUTH_SECRET` con al menos 32 caracteres.
3. Crea un almacén privado con `npx vercel blob create-store coordinador-tareas-private --access private` y configura `BLOB_READ_WRITE_TOKEN`.
4. Ejecuta `npm run db:migrate`. Opcionalmente define `SEED_DEMO_EMAIL` y `SEED_DEMO_PASSWORD` antes de `npm run db:seed`.

El almacén debe permanecer privado. La aplicación entrega cada entrega mediante `/api/files/:id` y cada compilación mediante `/api/pdf-builds/:id`, después de comprobar usuario y propiedad, con `Cache-Control: private, no-store`.

## Referencia visual y PDF

Los documentos originales se mantienen fuera de Git mediante `references/*`. Consulta [references/README.md](references/README.md) para los nombres admitidos. Para renderizar la referencia página por página:

```bash
npm run pdf:inspect-reference
```

El PDF final sigue el orden: portada del reporte, desempeño y evaluación, carátula, integrantes, desarrollo y anexos.

La validación reproducible genera un documento carta de 31 páginas con seis integrantes, una entrega PDF de 24 páginas y una imagen; después renderiza todas las páginas y comprueba estructura, tamaño y encabezados:

```bash
npm run pdf:qa
```

## Calidad

```bash
npm run lint
npm test
npm run build
# o todo junto
npm run check
```

Las pruebas unitarias cubren reglas de ejercicios, reinicio por sección, números repetidos entre secciones, distribución determinista, historial, exclusiones, bloqueos, pesos, notas, reporte, autenticación, protección de rutas, selección de páginas y firmas reales de archivos. `npm run test:e2e` ejecuta el flujo Playwright de registro, curso, integrante, tarea, distribución, evaluación y persistencia tras recargar.

## Despliegue

Con una sesión de Vercel autenticada:

```bash
npx vercel --prod
```

Configura en Vercel `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET` y la integración privada de Blob. El build ejecuta `prisma generate`; aplica las migraciones antes de publicar cambios de esquema.

## Privacidad

- Los PDFs originales, carnés reales, `.env*`, `tmp/` y `output/` están ignorados.
- Los datos demo son ficticios.
- No se registran contenidos de entregas en logs.
- La aplicación valida MIME real, tamaño, hash, autorización y pertenencia antes de registrar una entrega.

## Limitaciones conocidas

La compilación se realiza en el navegador para evitar los límites de memoria de funciones serverless y admite un máximo de 25 MB por PDF final. El recorte de imágenes es uniforme por borde; no incluye todavía un marco gráfico de recorte libre. Las cargas directas por estudiantes quedan fuera del MVP: por ahora las registra el coordinador.

## Próximas mejoras

- Añadir enlaces individuales de entrega para estudiantes.
- Añadir recorte libre con marco visual y automatizar Playwright en CI.

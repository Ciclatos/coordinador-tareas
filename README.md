# Coordinador de Tareas

## Administración de almacenamiento

La sección **Configuración > Almacenamiento** consulta el inventario privado de Vercel Blob y lo cruza con PostgreSQL. Muestra uso total, entregas vigentes y consolidadas, archivos eliminables, ahorro acumulado, versiones históricas, PDF finales, archivos QA, temporales, duplicados y huérfanos. Las limpiezas globales requieren autorización administrativa y la frase `LIMPIAR ALMACENAMIENTO`; nunca incluyen archivos con referencias vigentes.

Comandos operativos:

```bash
npm run storage:audit
npm run storage:cleanup:preview
npm run storage:audit -- --cleanup-orphans --execute --confirm=DELETE_UNREFERENCED_BLOBS
```

Variables:

- `BLOB_STORAGE_LIMIT_BYTES`: límite mostrado en el panel; por defecto 1 GiB.
- `STORAGE_ADMIN_EMAILS`: lista separada por comas autorizada para limpiezas. Si no se configura, se usa la cuenta real más antigua.
- `PDF_BUILD_RETENTION`: versiones finales conservadas por tarea; por defecto 3.
- `CRON_SECRET`: protege `/api/cron/storage-gc`, ejecutado diariamente por Vercel Cron.

El recolector aplica una gracia de 24 horas y solo elimina blobs sin referencia en `SubmissionFile`, `PdfBuild` o `CoverTemplate`. Los errores de capacidad se registran en servidor y se traducen a un mensaje seguro para estudiantes. Véase [la auditoría de producción](docs/storage-audit-2026-08-09.md).

Cada tarea ofrece un flujo separado de **Finalizar tarea** y **Liberar almacenamiento**. Finalizar exige un PDF vigente, ninguna entrega pendiente o en corrección y cobertura de todos los archivos actuales. Liberar requiere una segunda confirmación escrita; elimina únicamente binarios individuales y conserva metadatos, SHA-256, páginas, fechas, puntualidad, notas, comentarios y versiones finales. Después la tarea queda **Consolidada** y no puede reconstruir el PDF sin volver a cargar las fuentes. La eliminación automática es opcional (7, 14 o 30 días) y su valor predeterminado es **Nunca**.

Aplicación web en español para coordinar tareas grupales universitarias: define secciones y ejercicios, distribuye la carga considerando el historial, recibe archivos, registra evaluaciones y compila un PDF final tamaño carta.

## Enlaces

- Producción: [coordinador-tareas.vercel.app](https://coordinador-tareas.vercel.app)
- Repositorio: [github.com/Ciclatos/coordinador-tareas](https://github.com/Ciclatos/coordinador-tareas)

## Funcionalidad

- Dashboard responsive con progreso y estados de la tarea.
- Cursos, integrantes, tareas semanales y configuración localizada para Guatemala.
- Generador de rangos, pares, impares, múltiplos y listas alfanuméricas.
- Configuración independiente por sección con rango, intervalo, lista manual, exclusiones, inclusiones, peso, notas, duplicación, orden y vista previa persistente.
- Identidad de ejercicio compuesta por sección y etiqueta, de modo que `5.3:5` y `5.4:5` son diferentes.
- Distribución híbrida determinista: considera saldo histórico, rotación por sección, pesos, exclusiones y asignaciones bloqueadas.
- Matriz editable para mover ejercicios entre integrantes.
- Exportación PNG diseñada para WhatsApp: resumen vertical paginado, tarjetas individuales y matriz clásica; incluye vista previa responsive, nombres completos o cortos, color, fecha, instrucciones, totales, pesos, descarga robusta, copia, Web Share con fallback y ZIP de tarjetas.
- Entregas PDF, JPG, PNG y WEBP en Vercel Blob privado, con validación binaria, SHA-256, versiones y acceso autenticado.
- Evaluación rápida con rúbricas configurables por curso, máximos dinámicos, motivos de reducción, comentarios y plantillas versionadas.
- Reporte determinista persistido, regenerable desde datos actuales y editable, sin depender de una API de IA. Resume comentarios académicos por presentación, puntualidad, procedimiento, legibilidad y correcciones; las observaciones individuales son opcionales y respetan su marca de privacidad.
- PDF final mediante `pdf-lib`: portada, desempeño, evaluación detallada, resumen, carátula con logo, integrantes, entregas y numeración. Incluye miniaturas PDF.js, selección de páginas, rotación, recorte de imágenes, drag and drop, perfiles Alta/Equilibrada/Compacta, estimación de tamaño y versiones privadas descargables.
- Autenticación por correo y contraseña, sesiones firmadas y persistencia multiusuario en Lakebase Postgres (Neon) mediante Prisma.
- Onboarding guiado en español con tutorial general, recorridos contextuales por módulo, centro de ayuda, repetición y progreso sincronizado entre dispositivos.

## Arquitectura

La interfaz usa Next.js App Router y TypeScript estricto. `src/lib/domain.ts` contiene reglas puras y testeables; `src/lib/pdf.ts` compone el documento en el navegador para evitar límites de memoria serverless; Prisma persiste los modelos en Lakebase Postgres. Las rutas de servidor comprueban la sesión y la propiedad del curso antes de operar. Las cargas van directamente del navegador a Blob mediante un token limitado y después se verifican y registran en una transacción.

Los recorridos usan Driver.js 1.8: tiene una huella pequeña, tipos TypeScript, soporte para objetivos dinámicos o ausentes, teclado y una API desacoplada de la versión de React. El contenido tipado y versionado vive en `src/tutorials/tutorialDefinitions.ts`; los componentes solo exponen selectores estables `data-tutorial`. La tabla `UserTutorialProgress` es la fuente de verdad y permite continuar el progreso en otro dispositivo. Las cuentas creadas después de esta función reciben el tutorial general una sola vez; a cuentas anteriores se les muestra únicamente una invitación discreta.

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

Los PDF con texto o fórmulas vectoriales se copian sin rasterización. PDF.js detecta páginas que ya son escaneos sin texto seleccionable y únicamente esas páginas se recomprimen según el perfil elegido: **Alta** (200 DPI objetivo, 90 %), **Equilibrada** (165 DPI, 78 %, predeterminada) y **Compacta** (120 DPI, 62 %). Véase [la auditoría y política de consolidación](docs/pdf-storage-optimization-2026-08-10.md).

La validación reproducible genera un documento carta de 31 páginas con seis integrantes, una entrega PDF de 24 páginas y una imagen; después renderiza todas las páginas y comprueba estructura, tamaño y encabezados:

```bash
npm run pdf:qa
npm run image:qa
```

`image:qa` usa 6 integrantes, 3 secciones y 228 ejercicios ficticios. Genera `output/qa/whatsapp-resumen.png`, `whatsapp-resumen-parte-2.png`, `tarjeta-integrante.png` y `matriz-clasica.png`, y valida formato y dimensiones.

## Calidad

```bash
npm run lint
npm test
npm run build
# o todo junto
npm run check
```

Las pruebas unitarias cubren reglas de ejercicios, reinicio por sección, números repetidos entre secciones, distribución determinista, historial, exclusiones, bloqueos, pesos, notas, reporte, autenticación, protección de rutas, DTOs seguros de entregas, presentación traducida, tutoriales, selección de páginas y firmas reales de archivos. `npm run test:e2e` ejecuta los flujos Playwright de registro, onboarding, curso, integrante, tarea, distribución, portal público, revisión de entregas, evaluación y persistencia tras recargar.

## Ayuda y tutoriales

El área privada incluye los recorridos **Primeros pasos**, **Cursos**, **Integrantes**, **Tareas**, **Distribución**, **Portal de entrega**, **Entregas**, **Evaluación**, **Reporte** y **PDF final**. Cada módulo ofrece **Ver tutorial** y el centro **Ayuda y tutoriales** permite continuar, repetir o reiniciar recorridos. Omitir o completar impide que el tutorial reaparezca automáticamente; repetir un recorrido completado no borra ese estado.

Los recorridos omiten de forma segura objetivos que aún no existen y se adaptan a escritorio y teléfono. Escape cierra el recorrido, el foco queda dentro del popover y `prefers-reduced-motion` desactiva animaciones. El portal público `/entregar/[token]`, autenticación y páginas de error nunca montan el sistema de tutoriales.

## Portal público de entregas

Cada tarea dispone de **Portal de entrega** en la pantalla de entregas. El coordinador puede activarlo, definir apertura/cierre, tardías, reemplazos, formatos, tamaño e instrucciones; copiar o compartir el mensaje; previsualizarlo; y regenerar el token para revocar inmediatamente el enlace anterior.

El estudiante abre `/entregar/[token]` sin cuenta, selecciona su nombre y confirma su carné. El carné se compara exclusivamente en el servidor: nunca se incluye en el HTML ni en las respuestas públicas. Una sesión firmada, `HttpOnly`, `SameSite=Strict` y de 30 minutos queda limitada al portal, tarea e integrante. Los intentos fallidos usan rate limiting progresivo por hash de IP/portal y se auditan sin guardar el carné ingresado.

Después de identificarse, el estudiante ve únicamente su asignación, carga un archivo directamente al Blob privado y confirma el envío. El servidor comprueba tamaño, MIME real, firma/estructura, páginas, integridad y SHA-256 antes de crear una versión en las mismas entidades `Submission`, `SubmissionVersion` y `SubmissionFile` usadas por el coordinador y el constructor del PDF final. La primera entrega conserva su puntualidad; los reemplazos mantienen historial y una corrección solicitada habilita una nueva versión.

No requiere variables nuevas: usa `AUTH_SECRET` para firma/HMAC/cifrado de tokens, la base configurada y `BLOB_READ_WRITE_TOKEN`. La base debe recibir la migración antes del despliegue:

```bash
npm run db:migrate
```

Los portales tienen `noindex`, `nofollow`, `no-store`; los archivos no poseen URL pública permanente. El carné es una verificación ligera y no sustituye autenticación de alta seguridad. El rate limiting persistido en Postgres es deliberadamente conservador; instalaciones con tráfico masivo pueden mover los contadores a un almacén dedicado.

Para ejecutar el mismo flujo contra un despliegue existente sin iniciar el servidor local:

```bash
PLAYWRIGHT_BASE_URL=https://coordinador-tareas.vercel.app npm run test:e2e
```

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

La compilación se realiza en el navegador para evitar los límites de memoria de funciones serverless y admite hasta 250 MB por PDF final. La estimación previa es orientativa; la reducción exacta se muestra después de generar. Los PDF vectoriales que ya llegan internamente optimizados no se reescriben. Una tarea consolidada necesita volver a cargar sus fuentes para reconstruirse. El recorte de imágenes es uniforme por borde; no incluye todavía un marco gráfico de recorte libre. El comprobante del portal se puede copiar; no genera un PDF independiente.

## Próximas mejoras

- Añadir recorte libre con marco visual y automatizar Playwright en CI.

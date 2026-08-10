# Auditoría de almacenamiento - 9 de agosto de 2026

## Incidente y causa

Vercel Blob contenía 118 objetos por 1,001,571,880 bytes (955.17 MiB, 93.28 % del límite configurado de 1 GiB). La causa principal no eran las entregas vigentes: las pruebas E2E y los borrados en PostgreSQL que no eliminaban sus blobs dejaron 72 objetos huérfanos por 487.83 MiB. Además, las compilaciones finales conservaban versiones históricas grandes sin una política de retención.

## Inventario anterior a la limpieza

| Categoría | Archivos | Tamaño |
|---|---:|---:|
| Entregas vigentes reales | 26 | 133.38 MiB |
| PDF finales vigentes | 5 | 108.63 MiB |
| PDF finales históricos | 4 | 198.82 MiB |
| QA/E2E referenciado | 11 | 26.51 MiB |
| QA/E2E huérfano | 27 | 277.68 MiB |
| Otros huérfanos | 45 | 210.15 MiB |
| Miniaturas/previews persistentes | 0 | 0 MiB |

Había 12 grupos de contenido duplicado, equivalentes a 32.38 MiB en copias. La mayoría pertenecía a ejecuciones de prueba o versiones deliberadas, por lo que el hash por sí solo no se utilizó como criterio de borrado.

## Limpieza ejecutada

- Se eliminaron 72 blobs sin referencia válida, todos con más de 24 horas.
- Se eliminaron tres cuentas automatizadas estrictamente identificadas por el patrón `e2e-/portal-@example.com` y sus diez blobs referenciados.
- Se conservaron todos los `SubmissionFile` reales y todos los blobs que tenían referencias válidas.
- Se conservaron por prudencia las versiones históricas reales ya generadas.

Resultado: 36 objetos, 462,300,973 bytes (440.88 MiB, 43.06 %). Se recuperaron 539,270,907 bytes (514.29 MiB). No quedaron huérfanos detectados.

## Prevención

- El recolector solo borra objetos sin referencia en PostgreSQL y aplica una ventana de seguridad de 24 horas para no interferir con cargas en curso.
- Vercel Cron ejecuta el recolector diariamente con `CRON_SECRET`.
- Los PDF finales nuevos conservan como máximo tres versiones por tarea (`PDF_BUILD_RETENTION`). Al crear una cuarta, se elimina la más antigua de PostgreSQL y Blob.
- El panel Configuración > Almacenamiento muestra consumo, categorías, duplicados y huérfanos. Las limpiezas requieren una frase de confirmación y autorización administrativa.
- Los errores de cuota se registran técnicamente en servidor, pero el estudiante recibe un mensaje neutral y accionable.

## Evaluación de proveedor

- **Vercel Blob Hobby:** integración actual excelente y 1 GB incluido; al superar el límite, Blob deja de estar disponible. El almacenamiento adicional en planes con cobro bajo demanda cuesta $0.023/GB-mes y la transferencia comienza en $0.050/GB. Fuente: https://vercel.com/docs/vercel-blob/usage-and-pricing
- **Cloudflare R2:** compatible con S3, 10 GB-mes gratuitos, 1 millón de operaciones clase A, 10 millones clase B y transferencia directa sin costo. Después del nivel gratuito, Standard cuesta $0.015/GB-mes. Fuente: https://developers.cloudflare.com/r2/pricing/
- **Supabase Storage:** 1 GB en Free; Pro incluye 100 GB y el exceso cuesta $0.0213/GB-mes. Su integración sería sencilla, pero no amplía el margen gratuito frente a Blob sin pasar a Pro. Fuente: https://supabase.com/docs/guides/storage/pricing
- **Ampliar Vercel:** elimina el corte rígido y conserva el código actual, pero mantiene mayor costo por GB y transferencia que R2.

Decisión actual: permanecer temporalmente en Vercel Blob con recolección y retención activas. Con 43.06 % usado hay margen operativo inmediato y no se justifica una migración urgente que aumentaría el riesgo sobre entregas reales. Cloudflare R2 queda como destino recomendado cuando el uso vuelva a 75 % o antes de incorporar varios coordinadores de alto volumen.

## Capacidad aproximada

Quedan cerca de 583 MiB libres. Con el promedio observado de 5.38 MiB por archivo vigente, equivalen a unas 108 cargas adicionales si no se consideran PDF finales. En la práctica, los PDF finales también consumen espacio; con retención de tres versiones, se recomienda iniciar la migración a R2 al llegar al 75 % y no utilizar el margen crítico como capacidad planificada.

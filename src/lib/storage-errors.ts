const STORAGE_MESSAGE =
  "No fue posible enviar tu tarea en este momento. El almacenamiento del sistema se encuentra temporalmente lleno. Comunícate con el coordinador e inténtalo nuevamente más tarde.";

export function isStorageCapacityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /storage quota exceeded|quota exceeded|store suspended|insufficient storage/i.test(
    message,
  );
}

export function publicUploadError(error: unknown, fallback: string) {
  return isStorageCapacityError(error) ? STORAGE_MESSAGE : fallback;
}

export function logStorageError(context: string, error: unknown) {
  if (!isStorageCapacityError(error)) return;
  console.error("storage_capacity_error", {
    context,
    message: error instanceof Error ? error.message : String(error),
  });
}

export { STORAGE_MESSAGE };

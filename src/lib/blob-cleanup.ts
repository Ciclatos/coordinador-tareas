import { del } from "@vercel/blob";

export async function deleteBlobKeysWithRetry(keys: string[], attempts = 3) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await del(unique);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1)
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

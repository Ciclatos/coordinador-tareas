export function isRetryableNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /fetch failed|network|timeout|timed out|load failed|connection|econnreset|etimedout/i.test(message);
}

export async function withNetworkRetry<T>(operation: () => Promise<T>, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }
  throw lastError;
}

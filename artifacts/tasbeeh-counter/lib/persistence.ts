export type RetryOptions = {
  attempts?: number;
  delayMs?: number;
};

function wait(delayMs: number) {
  return delayMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();
}

export async function retryAsync<T>(
  operation: () => Promise<T>,
  { attempts = 3, delayMs = 75 }: RetryOptions = {},
): Promise<T> {
  const safeAttempts = Math.max(1, Math.floor(attempts));
  let lastError: unknown;

  for (let attempt = 0; attempt < safeAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < safeAttempts - 1) await wait(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Operation failed'));
}
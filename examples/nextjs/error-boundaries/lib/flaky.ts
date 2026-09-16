// Per-process call counters. Each key fails on its 1st, 3rd, 5th... call and
// succeeds on the 2nd, 4th, 6th... call, so the first visit shows an error and
// the next retry() recovers. Restarting the server resets the counters.
const calls = new Map<string, number>();

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function failEveryOtherCall(key: string, message: string): Promise<number> {
  const count = (calls.get(key) ?? 0) + 1;
  calls.set(key, count);
  await wait(400);
  if (count % 2 === 1) {
    // In production the browser receives a generic message and a digest.
    // The full message below only appears in the server log.
    throw new Error(`${message} (call ${count})`);
  }
  return count;
}

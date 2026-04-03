/**
 * Run async work with a max concurrency limit. Avoids hammering APIs that throttle
 * many parallel requests (e.g. last jobs stalling for minutes).
 */
export async function asyncPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const n = items.length;
  if (n === 0) return [];
  const results: R[] = new Array(n);
  let next = 0;
  const cap = Math.min(Math.max(1, concurrency), n);

  async function runWorker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= n) return;
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: cap }, () => runWorker()));
  return results;
}

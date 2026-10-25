/**
 * Runs async tasks one at a time, in call order. Used to keep
 * read-modify-write cycles on a single storage key from interleaving.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();

  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

export type SerialQueue = ReturnType<typeof createSerialQueue>;

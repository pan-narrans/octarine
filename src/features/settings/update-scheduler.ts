export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;

interface UpdateSchedulerOptions {
  check: () => Promise<void>;
  intervalMs?: number;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
}

export function startUpdateScheduler({
  check,
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
  schedule = setTimeout,
  cancel = clearTimeout,
}: UpdateSchedulerOptions): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = async () => {
    await check();
    if (!stopped) timer = schedule(() => void run(), intervalMs);
  };

  void run();
  return () => {
    stopped = true;
    if (timer !== null) cancel(timer);
  };
}

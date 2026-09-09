// observability for the client-mux pipeline

type EmeOutcome = 'success' | 'failure' | 'skip';

interface EmeStats {
  attempts: number;
  successes: number;
  failures: number;
  skips: number;
  lastReason?: string;
}

const STORAGE_KEY = 'phantom:eme-stats';

const emptyStats = (): EmeStats => ({
  attempts: 0,
  successes: 0,
  failures: 0,
  skips: 0,
});

const readStats = (): EmeStats => {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(STORAGE_KEY)
        : null;
    if (raw) return { ...emptyStats(), ...(JSON.parse(raw) as EmeStats) };
  } catch {
    // unreadable storage falls back to empty
  }
  return emptyStats();
};

const writeStats = (stats: EmeStats): void => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    }
  } catch {
    // ignore unwritable storage
  }
};

export const recordEmeAttempt = (): void => {
  const stats = readStats();
  stats.attempts += 1;
  writeStats(stats);
};

export const recordEmeOutcome = (
  outcome: EmeOutcome,
  reason?: string
): void => {
  const stats = readStats();
  if (outcome === 'success') stats.successes += 1;
  else if (outcome === 'skip') stats.skips += 1;
  else {
    stats.failures += 1;
    stats.lastReason = reason;
  }
  writeStats(stats);

  const decided = stats.successes + stats.failures;
  const rate = decided > 0 ? Math.round((stats.successes / decided) * 100) : 0;
  const tail = reason ? ` (${reason})` : '';
  console.info(
    `[EME] ${outcome}${tail} — ${stats.successes}/${decided} ok (${rate}%), ${stats.skips} skipped`
  );
};

export const getEmeStats = (): EmeStats => readStats();

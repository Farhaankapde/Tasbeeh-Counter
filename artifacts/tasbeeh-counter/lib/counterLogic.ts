export type CountFeedback = 'target' | 'milestone' | 'tap';
export type DhikrRecord = { id: string; name: string; arabic?: string; translation?: string; icon: string };
export type HistoryEntry = { id: string; dhikr: string; dhikrId?: string; repetitions: number; time: string; date?: string };
export type AppState = {
  dhikrs: DhikrRecord[];
  selectedId: string;
  counters: Record<string, number>;
  targets: Record<string, number | null>;
  dailyCounts: Record<string, number>;
  dailyCountsByDhikr: Record<string, Record<string, number>>;
  lifetimeCount: number;
  vibration: boolean;
  sound: boolean;
  counterAnimation: boolean;
  autoSave: boolean;
  stopAtTarget: boolean;
  theme: 'dark' | 'light';
  history: HistoryEntry[];
};

export const MILESTONES = [33, 99, 100] as const;

export function shouldStopCounting(count: number, target: number | null, stopAtTarget: boolean) {
  return stopAtTarget && target !== null && count >= target;
}

export function canAcceptCount(count: number, target: number | null, stopAtTarget: boolean, hydrated: boolean) {
  return hydrated && count < 999999 && !shouldStopCounting(count, target, stopAtTarget);
}

export function getCountFeedback(nextCount: number, target: number | null): CountFeedback {
  if (target !== null && nextCount === target) return 'target';
  if (MILESTONES.some((milestone) => milestone === nextCount)) return 'milestone';
  return 'tap';
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculateStats(dailyCounts: Record<string, number>, lifetimeCount: number, date = new Date(), dailyCountsByDhikr: Record<string, Record<string, number>> = {}) {
  const today = getLocalDateKey(date);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const weekStart = getLocalDateKey(start);
  const legacyToday = dailyCounts[today] ?? 0;
  const legacyWeek = Object.entries(dailyCounts).reduce((sum, [key, value]) => key >= weekStart && key <= today ? sum + value : sum, 0);
  const currentTotals = Object.values(dailyCountsByDhikr).reduce(
    (totals, entries) => {
      totals.today += entries[today] ?? 0;
      totals.week += Object.entries(entries).reduce((sum, [key, value]) => key >= weekStart && key <= today ? sum + value : sum, 0);
      return totals;
    },
    { today: 0, week: 0 },
  );
  return { today: legacyToday + currentTotals.today, thisWeek: legacyWeek + currentTotals.week, total: lifetimeCount };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNumberRecord(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, count]) => typeof count === 'number' && Number.isFinite(count) && count >= 0),
  ) as Record<string, number>;
}

export function migrateStoredState(value: unknown, defaults: AppState, legacyDhikrs: DhikrRecord[] = []): AppState {
  const parsed = isRecord(value) ? value : {};
  const hasDhikrs = Array.isArray(parsed.dhikrs);
  const dhikrs = hasDhikrs
    ? (parsed.dhikrs as unknown[]).filter((item: unknown): item is DhikrRecord => isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.icon === 'string')
    : legacyDhikrs;
  const counters = { ...defaults.counters, ...normalizeNumberRecord(parsed.counters) };
  const targetValues = isRecord(parsed.targets) ? parsed.targets : {};
  const targets = { ...defaults.targets };
  for (const [id, target] of Object.entries(targetValues)) {
    if (target === null || (typeof target === 'number' && Number.isInteger(target) && target >= 1 && target <= 999999)) {
      targets[id] = target;
    }
  }
  const dailyCounts = normalizeNumberRecord(parsed.dailyCounts);
  const rawDailyByDhikr = isRecord(parsed.dailyCountsByDhikr) ? parsed.dailyCountsByDhikr : {};
  const dailyCountsByDhikr = Object.fromEntries(
    Object.entries(rawDailyByDhikr).map(([id, entries]) => [id, normalizeNumberRecord(entries)]),
  ) as Record<string, Record<string, number>>;
  const counterSum = Object.values(counters).reduce((sum, count) => sum + count, 0);
  const savedLifetime = typeof parsed.lifetimeCount === 'number' && Number.isFinite(parsed.lifetimeCount) && parsed.lifetimeCount >= 0
    ? parsed.lifetimeCount
    : 0;
  const savedSelectedId = typeof parsed.selectedId === 'string' ? parsed.selectedId : '';
  const history = Array.isArray(parsed.history)
    ? (parsed.history as HistoryEntry[]).map((entry) => {
      if (entry.dhikrId || typeof entry.dhikr !== 'string') return entry;
      const matchingDhikr = dhikrs.find((item) => item.name.trim().toLocaleLowerCase() === entry.dhikr.trim().toLocaleLowerCase());
      return matchingDhikr ? { ...entry, dhikrId: matchingDhikr.id } : entry;
    })
    : defaults.history;
  return {
    ...defaults,
    ...parsed,
    dhikrs,
    selectedId: dhikrs.some((item: DhikrRecord) => item.id === savedSelectedId)
      ? savedSelectedId
      : dhikrs[0]?.id ?? '',
    counters,
    targets,
    dailyCounts,
    dailyCountsByDhikr,
    lifetimeCount: Math.max(savedLifetime, counterSum),
    vibration: typeof parsed.vibration === 'boolean' ? parsed.vibration : defaults.vibration,
    sound: typeof parsed.sound === 'boolean' ? parsed.sound : defaults.sound,
    counterAnimation: typeof parsed.counterAnimation === 'boolean' ? parsed.counterAnimation : defaults.counterAnimation,
    autoSave: typeof parsed.autoSave === 'boolean' ? parsed.autoSave : defaults.autoSave,
    stopAtTarget: parsed.stopAtTarget === true,
    theme: parsed.theme === 'light' ? 'light' : 'dark',
    history,
  };
}

export function restoreStoredState(value: unknown, defaults: AppState, legacyDhikrs: DhikrRecord[] = []): AppState {
  return value === null || value === undefined
    ? defaults
    : migrateStoredState(value, defaults, legacyDhikrs);
}
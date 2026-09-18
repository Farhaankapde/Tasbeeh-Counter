export type CountFeedback = 'target' | 'milestone' | 'tap';
export type AccentTheme = 'red' | 'green' | 'blue';
export type DhikrRecord = { id: string; name: string; arabic?: string; translation?: string; icon: string };
export type HistoryEntry = { id: string; dhikr: string; dhikrId?: string; repetitions: number; time: string; date?: string };
export type AppState = {
  dhikrs: DhikrRecord[];
  selectedId: string;
  anonymousCount: number;
  counters: Record<string, number>;
  targets: Record<string, number | null>;
  dailyCounts: Record<string, number>;
  dailyCountsByDhikr: Record<string, Record<string, number>>;
  lifetimeCount: number;
  lifetimeCountsByDhikr: Record<string, number>;
  vibration: boolean;
  sound: boolean;
  counterAnimation: boolean;
  autoSave: boolean;
  stopAtTarget: boolean;
  theme: 'dark' | 'light';
  accentTheme: AccentTheme;
  history: HistoryEntry[];
};

export type PracticeSnapshot = Pick<AppState, 'counters' | 'dailyCounts' | 'dailyCountsByDhikr' | 'lifetimeCount' | 'lifetimeCountsByDhikr' | 'history'>;

export const MILESTONES = [33, 99, 100] as const;

export function getPracticeSnapshot(state: AppState): PracticeSnapshot {
  return {
    counters: state.counters,
    dailyCounts: state.dailyCounts,
    dailyCountsByDhikr: state.dailyCountsByDhikr,
    lifetimeCount: state.lifetimeCount,
    lifetimeCountsByDhikr: state.lifetimeCountsByDhikr,
    history: state.history,
  };
}

export function getStateForPersistence(state: AppState, savedPractice: PracticeSnapshot): AppState {
  return { ...state, autoSave: true, ...getPracticeSnapshot(state) };
}

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

export function getLcdFontSize(count: number) {
  const digitCount = Math.max(3, String(Math.max(0, Math.floor(count))).length);
  if (digitCount >= 6) return 32;
  if (digitCount === 5) return 38;
  if (digitCount === 4) return 46;
  return 55;
}

export function canContinueHistorySession(activeSessionId: string | null, lastEntry: HistoryEntry | undefined, dhikrId: string, date: string) {
  return Boolean(activeSessionId && lastEntry && activeSessionId === lastEntry.id && lastEntry.dhikrId === dhikrId && lastEntry.date === date);
}

export function calculateStats(dailyCounts: Record<string, number>, lifetimeCount: number, date = new Date(), dailyCountsByDhikr: Record<string, Record<string, number>> = {}) {
  const today = getLocalDateKey(date);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const weekStart = getLocalDateKey(start);
  const perDhikrByDate = Object.values(dailyCountsByDhikr).reduce<Record<string, number>>((totals, entries) => {
    Object.entries(entries).forEach(([key, value]) => { totals[key] = (totals[key] ?? 0) + value; });
    return totals;
  }, {});
  const dates = new Set([...Object.keys(dailyCounts), ...Object.keys(perDhikrByDate)]);
  const totalForDate = (key: string) => dailyCounts[key] ?? perDhikrByDate[key] ?? 0;
  const todayTotal = dates.has(today) ? totalForDate(today) : 0;
  const weekTotal = Array.from(dates).reduce((sum, key) => key >= weekStart && key <= today ? sum + totalForDate(key) : sum, 0);
  return { today: todayTotal, thisWeek: weekTotal, total: lifetimeCount };
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

function isValidDateKey(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function isValidHistoryEntry(value: unknown): value is HistoryEntry {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.trim() === '') return false;
  if (typeof value.dhikr !== 'string' || value.dhikr.trim() === '') return false;
  if (typeof value.repetitions !== 'number' || !Number.isInteger(value.repetitions) || value.repetitions < 1) return false;
  if (typeof value.time !== 'string' || value.time.trim() === '') return false;
  if (value.dhikrId !== undefined && (typeof value.dhikrId !== 'string' || value.dhikrId.trim() === '')) return false;
  if (value.date !== undefined && !isValidDateKey(value.date)) return false;
  return true;
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
  const hasDurableDhikrTotals = isRecord(parsed.lifetimeCountsByDhikr);
  if (!hasDurableDhikrTotals) {
    const reconstructedDailyCounts = Object.values(dailyCountsByDhikr).reduce<Record<string, number>>((totals, entries) => {
      Object.entries(entries).forEach(([date, count]) => { totals[date] = (totals[date] ?? 0) + count; });
      return totals;
    }, {});
    Object.entries(reconstructedDailyCounts).forEach(([date, count]) => {
      if (dailyCounts[date] === undefined) dailyCounts[date] = count;
    });
  }
  const counterSum = Object.values(counters).reduce((sum, count) => sum + count, 0);
  const savedLifetime = typeof parsed.lifetimeCount === 'number' && Number.isFinite(parsed.lifetimeCount) && parsed.lifetimeCount >= 0
    ? parsed.lifetimeCount
    : 0;
  const lifetimeCountsByDhikr = normalizeNumberRecord(parsed.lifetimeCountsByDhikr);
  const savedSelectedId = typeof parsed.selectedId === 'string' ? parsed.selectedId : '';
  const savedAnonymousCount = typeof parsed.anonymousCount === 'number' && Number.isFinite(parsed.anonymousCount) && parsed.anonymousCount >= 0
    ? Math.min(Math.floor(parsed.anonymousCount), 999999)
    : defaults.anonymousCount;
  const history = Array.isArray(parsed.history)
    ? parsed.history.filter(isValidHistoryEntry).map((entry) => {
      if (entry.dhikrId || typeof entry.dhikr !== 'string') return entry;
      const matchingDhikr = dhikrs.find((item) => item.name.trim().toLocaleLowerCase() === entry.dhikr.trim().toLocaleLowerCase());
      return matchingDhikr ? { ...entry, dhikrId: matchingDhikr.id } : entry;
    })
    : defaults.history;
  const historyTotalsByDhikr = history.reduce<Record<string, number>>((totals, entry) => {
    if (entry.dhikrId) totals[entry.dhikrId] = (totals[entry.dhikrId] ?? 0) + entry.repetitions;
    return totals;
  }, {});
  const allDhikrIds = new Set([
    ...Object.keys(counters),
    ...Object.keys(dailyCountsByDhikr),
    ...Object.keys(lifetimeCountsByDhikr),
    ...Object.keys(historyTotalsByDhikr),
  ]);
  allDhikrIds.forEach((id) => {
    const dailyTotal = Object.values(dailyCountsByDhikr[id] ?? {}).reduce((sum, count) => sum + count, 0);
    lifetimeCountsByDhikr[id] = Math.max(
      lifetimeCountsByDhikr[id] ?? 0,
      counters[id] ?? 0,
      dailyTotal,
      historyTotalsByDhikr[id] ?? 0,
    );
  });
  return {
    ...defaults,
    ...parsed,
    dhikrs,
    selectedId: dhikrs.some((item: DhikrRecord) => item.id === savedSelectedId)
      ? savedSelectedId
      : dhikrs[0]?.id ?? '',
    anonymousCount: savedAnonymousCount,
    counters,
    targets,
    dailyCounts,
    dailyCountsByDhikr,
    lifetimeCount: Math.max(savedLifetime, counterSum),
    lifetimeCountsByDhikr,
    vibration: typeof parsed.vibration === 'boolean' ? parsed.vibration : defaults.vibration,
    sound: typeof parsed.sound === 'boolean' ? parsed.sound : defaults.sound,
    counterAnimation: typeof parsed.counterAnimation === 'boolean' ? parsed.counterAnimation : defaults.counterAnimation,
    autoSave: true,
    stopAtTarget: parsed.stopAtTarget === true,
    theme: parsed.theme === 'light' ? 'light' : 'dark',
    accentTheme: parsed.accentTheme === 'green' || parsed.accentTheme === 'blue' ? parsed.accentTheme : 'red',
    history,
  };
}

export function createLatestStatePersister<T>(write: (state: T) => Promise<void>) {
  let pending: T | null = null;
  let running = false;
  let currentRun: Promise<void> = Promise.resolve();

  const pump = async () => {
    while (pending !== null) {
      const next = pending;
      pending = null;
      await write(next);
    }
    running = false;
  };

  return {
    enqueue(state: T) {
      pending = state;
      if (!running) {
        running = true;
        currentRun = pump().catch((error) => {
          running = false;
          throw error;
        });
      }
      return currentRun;
    },
  };
}

export function restoreStoredState(value: unknown, defaults: AppState, legacyDhikrs: DhikrRecord[] = []): AppState {
  return value === null || value === undefined
    ? defaults
    : migrateStoredState(value, defaults, legacyDhikrs);
}
export type CountFeedback = 'target' | 'milestone' | 'tap';

export const MILESTONES = [33, 99, 100] as const;

export function shouldStopCounting(count: number, target: number | null, stopAtTarget: boolean) {
  return stopAtTarget && target !== null && count >= target;
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

export function calculateStats(dailyCounts: Record<string, number>, lifetimeCount: number, date = new Date()) {
  const today = getLocalDateKey(date);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const weekStart = getLocalDateKey(start);
  const thisWeek = Object.entries(dailyCounts).reduce(
    (sum, [key, value]) => key >= weekStart && key <= today ? sum + value : sum,
    0,
  );
  return { today: dailyCounts[today] ?? 0, thisWeek, total: lifetimeCount };
}
import { getLocalDateKey, type DhikrRecord, type HistoryEntry } from './counterLogic.ts';

export type HistoryGroup = {
  key: string;
  dateKey?: string;
  dhikr: string;
  entries: HistoryEntry[];
};

export type HistoryDateSection = 'TODAY' | 'YESTERDAY' | 'EARLIER';

export function getHistoryDateSection(date?: string, referenceDate = new Date()): HistoryDateSection {
  if (!date) return 'EARLIER';
  const today = getLocalDateKey(referenceDate);
  if (date === today) return 'TODAY';
  const yesterdayDate = new Date(referenceDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  return date === getLocalDateKey(yesterdayDate) ? 'YESTERDAY' : 'EARLIER';
}

export function groupHistoryEntries(history: HistoryEntry[], dhikrs: DhikrRecord[]): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>();
  history.forEach((entry) => {
    const currentName = dhikrs.find((item) => item.id === entry.dhikrId)?.name ?? entry.dhikr;
    const identity = entry.dhikrId ?? `name:${entry.dhikr.trim().toLocaleLowerCase()}`;
    const key = `${entry.date ?? 'previous'}:${identity}`;
    const existing = groups.get(key);
    if (existing) existing.entries.push(entry);
    else groups.set(key, { key, dateKey: entry.date, dhikr: currentName, entries: [entry] });
  });
  return Array.from(groups.values());
}
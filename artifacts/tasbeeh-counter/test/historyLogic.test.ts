import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupHistoryEntries, getHistoryDateSection } from '../lib/historyLogic.ts';
import { getStateForPersistence, restoreStoredState, type AppState, type DhikrRecord, type HistoryEntry } from '../lib/counterLogic.ts';

const DHIKRS: DhikrRecord[] = [
  { id: 'subhanallah', name: 'SubhanAllah', icon: 'circle-double' },
  { id: 'alhamdulillah', name: 'Alhamdulillah', icon: 'flower-tulip' },
];

const DEFAULT_STATE: AppState = {
  dhikrs: [],
  selectedId: '',
  counters: {},
  targets: {},
  dailyCounts: {},
  dailyCountsByDhikr: {},
  lifetimeCount: 0,
  vibration: true,
  sound: true,
  counterAnimation: true,
  autoSave: true,
  stopAtTarget: false,
  theme: 'dark',
  accentTheme: 'red',
  history: [],
};

function session(id: string, dhikr: string, repetitions: number, date?: string, dhikrId?: string): HistoryEntry {
  return {
    id,
    dhikr,
    repetitions,
    time: `${id} time`,
    ...(dhikrId ? { dhikrId } : {}),
    ...(date ? { date } : {}),
  };
}

test('one session stays one group and keeps its original record', () => {
  const history = [session('session-1', 'SubhanAllah', 7, '2026-09-18', 'subhanallah')];

  const groups = groupHistoryEntries(history, DHIKRS);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].entries.length, 1);
  assert.equal(groups[0].entries[0], history[0]);
  assert.equal(groups[0].entries.reduce((total, entry) => total + entry.repetitions, 0), 7);
});

test('same-Dhikr sessions group by date, sum repetitions, and preserve every session exactly once', () => {
  const history = [
    session('session-3', 'SubhanAllah', 4, '2026-09-18', 'subhanallah'),
    session('session-2', 'SubhanAllah', 9, '2026-09-18', 'subhanallah'),
    session('session-1', 'SubhanAllah', 6, '2026-09-17', 'subhanallah'),
    session('session-4', 'Alhamdulillah', 3, '2026-09-18', 'alhamdulillah'),
  ];

  const groups = groupHistoryEntries(history, DHIKRS);
  const subhanAllahToday = groups.find((group) => group.dateKey === '2026-09-18' && group.dhikr === 'SubhanAllah');
  const allGroupedEntries = groups.flatMap((group) => group.entries);

  assert.equal(groups.length, 3);
  assert.ok(subhanAllahToday);
  assert.equal(subhanAllahToday.entries.length, 2);
  assert.equal(subhanAllahToday.entries.reduce((total, entry) => total + entry.repetitions, 0), 13);
  assert.deepEqual(allGroupedEntries.map((entry) => entry.id).sort(), history.map((entry) => entry.id).sort());
  assert.equal(allGroupedEntries.reduce((total, entry) => total + entry.repetitions, 0), 22);
});

test('date buckets distinguish today, yesterday, earlier, and undated legacy entries', () => {
  const referenceDate = new Date(2026, 8, 18, 12);

  assert.equal(getHistoryDateSection('2026-09-18', referenceDate), 'TODAY');
  assert.equal(getHistoryDateSection('2026-09-17', referenceDate), 'YESTERDAY');
  assert.equal(getHistoryDateSection('2026-09-16', referenceDate), 'EARLIER');
  assert.equal(getHistoryDateSection(undefined, referenceDate), 'EARLIER');
});

test('deleted Dhikrs remain visible through the history entry fallback name', () => {
  const history = [session('deleted-session', 'Old Dhikr', 12, '2026-09-18', 'deleted-dhikr')];

  const groups = groupHistoryEntries(history, DHIKRS);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].dhikr, 'Old Dhikr');
  assert.deepEqual(groups[0].entries, history);
});

test('persistence keeps every original session separate for later grouping', () => {
  const history = [
    session('session-3', 'SubhanAllah', 4, '2026-09-18', 'subhanallah'),
    session('session-2', 'SubhanAllah', 9, '2026-09-18', 'subhanallah'),
    session('legacy-session', 'Old Dhikr', 6),
  ];
  const state: AppState = {
    ...DEFAULT_STATE,
    dhikrs: DHIKRS,
    selectedId: 'subhanallah',
    history,
    autoSave: true,
  };

  const persisted = getStateForPersistence(state, { ...DEFAULT_STATE, history });
  const restored = restoreStoredState(JSON.parse(JSON.stringify(persisted)), DEFAULT_STATE);

  assert.deepEqual(restored.history, history);
  assert.deepEqual(groupHistoryEntries(restored.history, restored.dhikrs).flatMap((group) => group.entries), history);
});

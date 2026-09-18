import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateStats,
  canAcceptCount,
  canContinueHistorySession,
  createLatestStatePersister,
  getCountFeedback,
  getLcdFontSize,
  getPracticeSnapshot,
  getStateForPersistence,
  migrateStoredState,
  restoreStoredState,
  shouldStopCounting,
  type AppState,
  type DhikrRecord,
  type HistoryEntry,
} from '../lib/counterLogic.ts';

const LEGACY_DHIKRS: DhikrRecord[] = [
  { id: 'subhanallah', name: 'SubhanAllah', arabic: 'سُبْحَانَ ٱللَّٰهِ', icon: 'circle-double' },
  { id: 'alhamdulillah', name: 'Alhamdulillah', arabic: 'ٱلْحَمْدُ لِلَّٰهِ', icon: 'flower-tulip' },
  { id: 'allahu-akbar', name: 'Allahu Akbar', arabic: 'ٱللَّٰهُ أَكْبَرُ', icon: 'star-four-points' },
  { id: 'la-ilaha', name: 'La ilaha illallah', arabic: 'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ', icon: 'infinity' },
  { id: 'astaghfirullah', name: 'Astaghfirullah', arabic: 'أَسْتَغْفِرُ ٱللَّٰهُ', icon: 'water-outline' },
  { id: 'subhanallahi', name: 'SubhanAllahi wa bihamdihi', arabic: 'سُبْحَانَ ٱللَّٰهِ وَبِحَمْدِهِ', icon: 'weather-sunny' },
];

const DEFAULT_STATE: AppState = {
  dhikrs: [],
  selectedId: '',
  counters: {},
  targets: {},
  dailyCounts: {},
  dailyCountsByDhikr: {},
  lifetimeCount: 0,
  lifetimeCountsByDhikr: {},
  vibration: true,
  sound: true,
  counterAnimation: true,
  autoSave: true,
  stopAtTarget: false,
  theme: 'dark',
  accentTheme: 'red',
  history: [],
};

const STORAGE_KEY = 'tasbeeh-counter-state-v1';

async function simulateAppRestart(storage: Map<string, string>, legacyDhikrs = LEGACY_DHIKRS) {
  // This mirrors the app's AsyncStorage boundary: persistence stores JSON text,
  // then a fresh app instance reads and parses that text before hydration.
  const raw = await Promise.resolve(storage.get(STORAGE_KEY) ?? null);
  return restoreStoredState(raw ? JSON.parse(raw) as unknown : null, DEFAULT_STATE, legacyDhikrs);
}

test('a fresh install restores the empty library instead of legacy Dhikrs', () => {
  assert.deepEqual(restoreStoredState(null, DEFAULT_STATE, LEGACY_DHIKRS), DEFAULT_STATE);
  assert.deepEqual(restoreStoredState(undefined, DEFAULT_STATE, LEGACY_DHIKRS), DEFAULT_STATE);
});

test('a fresh install remains empty after an app restart and keeps the loading gate', async () => {
  const hydrated = await simulateAppRestart(new Map());

  assert.equal(canAcceptCount(0, null, false, false), false);
  assert.deepEqual(hydrated.dhikrs, []);
  assert.equal(hydrated.selectedId, '');
  assert.deepEqual(hydrated.counters, {});
  assert.deepEqual(hydrated.history, []);
  assert.equal(hydrated.lifetimeCount, 0);
  assert.equal(hydrated.theme, 'dark');
  assert.equal(hydrated.accentTheme, 'red');
  assert.equal(hydrated.vibration, true);
  assert.equal(hydrated.sound, true);
  assert.equal(hydrated.autoSave, true);
  assert.equal(canAcceptCount(0, null, false, true), true);
});

test('legacy six-Dhikr state preserves records, practice, selection, settings, history, and totals', () => {
  const matchedHistory: HistoryEntry = {
    id: 'history-matched',
    dhikr: ' subhanallah ',
    repetitions: 4,
    time: '8:15 AM',
    date: '2026-09-18',
  };
  const unmatchedHistory: HistoryEntry = {
    id: 'history-unmatched',
    dhikr: 'A Dhikr added elsewhere',
    repetitions: 2,
    time: '7:45 AM',
  };
  const stored = {
    selectedId: 'astaghfirullah',
    counters: {
      subhanallah: 12,
      alhamdulillah: 7,
      'allahu-akbar': 3,
      'la-ilaha': 1,
      astaghfirullah: 9,
      subhanallahi: 5,
    },
    targets: {
      subhanallah: 33,
      'allahu-akbar': null,
      astaghfirullah: 99,
    },
    dailyCounts: { '2026-09-17': 5, '2026-09-18': 4 },
    dailyCountsByDhikr: {
      subhanallah: { '2026-09-18': 2 },
    },
    lifetimeCount: 500,
    vibration: false,
    sound: false,
    counterAnimation: false,
    autoSave: false,
    stopAtTarget: true,
    theme: 'light',
    accentTheme: 'blue',
    history: [matchedHistory, unmatchedHistory],
  };

  const migrated = migrateStoredState(stored, DEFAULT_STATE, LEGACY_DHIKRS);

  assert.deepEqual(migrated.dhikrs, LEGACY_DHIKRS);
  assert.deepEqual(migrated.counters, stored.counters);
  assert.deepEqual(migrated.targets, stored.targets);
  assert.equal(migrated.selectedId, stored.selectedId);
  assert.equal(migrated.vibration, false);
  assert.equal(migrated.sound, false);
  assert.equal(migrated.counterAnimation, false);
  assert.equal(migrated.autoSave, true);
  assert.equal(migrated.stopAtTarget, true);
  assert.equal(migrated.theme, 'light');
  assert.equal(migrated.accentTheme, 'blue');
  assert.equal(migrated.lifetimeCount, stored.lifetimeCount);
  assert.deepEqual(migrated.dailyCounts, { '2026-09-17': 5, '2026-09-18': 4 });
  assert.deepEqual(migrated.dailyCountsByDhikr, stored.dailyCountsByDhikr);
  assert.deepEqual(migrated.lifetimeCountsByDhikr, {
    subhanallah: 12,
    alhamdulillah: 7,
    'allahu-akbar': 3,
    'la-ilaha': 1,
    astaghfirullah: 9,
    subhanallahi: 5,
  });
  assert.deepEqual(migrated.history, [
    { ...matchedHistory, dhikrId: 'subhanallah' },
    unmatchedHistory,
  ]);
});

test('a legacy six-Dhikr record survives an AsyncStorage-shaped app restart', async () => {
  const stored = {
    selectedId: 'astaghfirullah',
    counters: {
      subhanallah: 12,
      alhamdulillah: 7,
      'allahu-akbar': 3,
      'la-ilaha': 1,
      astaghfirullah: 9,
      subhanallahi: 5,
    },
    targets: {
      subhanallah: 33,
      'allahu-akbar': null,
      astaghfirullah: 99,
    },
    dailyCounts: { '2026-09-17': 5, '2026-09-18': 4 },
    dailyCountsByDhikr: {
      subhanallah: { '2026-09-18': 2 },
      astaghfirullah: { '2026-09-18': 1 },
    },
    lifetimeCount: 500,
    vibration: false,
    sound: false,
    counterAnimation: false,
    autoSave: false,
    stopAtTarget: true,
    theme: 'light',
    accentTheme: 'green',
    history: [
      {
        id: 'history-matched',
        dhikr: ' subhanallah ',
        repetitions: 4,
        time: '8:15 AM',
        date: '2026-09-18',
      },
      {
        id: 'history-unmatched',
        dhikr: 'A Dhikr added elsewhere',
        repetitions: 2,
        time: '7:45 AM',
      },
    ],
  };
  const storage = new Map([[STORAGE_KEY, JSON.stringify(stored)]]);
  const hydrated = await simulateAppRestart(storage);

  assert.deepEqual(hydrated.dhikrs.map(({ id }) => id), LEGACY_DHIKRS.map(({ id }) => id));
  assert.equal(hydrated.selectedId, 'astaghfirullah');
  assert.deepEqual(hydrated.counters, stored.counters);
  assert.deepEqual(hydrated.targets, stored.targets);
  assert.equal(hydrated.vibration, false);
  assert.equal(hydrated.sound, false);
  assert.equal(hydrated.counterAnimation, false);
  assert.equal(hydrated.autoSave, true);
  assert.equal(hydrated.stopAtTarget, true);
  assert.equal(hydrated.theme, 'light');
  assert.equal(hydrated.accentTheme, 'green');
  assert.equal(hydrated.lifetimeCount, 500);
  assert.deepEqual(hydrated.lifetimeCountsByDhikr, {
    subhanallah: 12,
    alhamdulillah: 7,
    'allahu-akbar': 3,
    'la-ilaha': 1,
    astaghfirullah: 9,
    subhanallahi: 5,
  });
  assert.deepEqual(hydrated.history, [
    { ...stored.history[0], dhikrId: 'subhanallah' },
    stored.history[1],
  ]);
  assert.deepEqual(calculateStats(hydrated.dailyCounts, hydrated.lifetimeCount, new Date(2026, 8, 18, 12), hydrated.dailyCountsByDhikr), {
    today: 4,
    thisWeek: 9,
    total: 500,
  });
});

test('migration keeps a current empty library empty', () => {
  const migrated = migrateStoredState({ dhikrs: [], selectedId: 'missing' }, DEFAULT_STATE, LEGACY_DHIKRS);
  assert.deepEqual(migrated.dhikrs, []);
  assert.equal(migrated.selectedId, '');
});

test('legacy migration reconstructs only missing daily aggregate dates', () => {
  const migrated = migrateStoredState({
    ...DEFAULT_STATE,
    dhikrs: LEGACY_DHIKRS.slice(0, 2),
    dailyCounts: { '2026-09-17': 5 },
    dailyCountsByDhikr: {
      subhanallah: { '2026-09-17': 2, '2026-09-18': 3 },
      alhamdulillah: { '2026-09-18': 4 },
    },
    lifetimeCountsByDhikr: undefined,
  }, DEFAULT_STATE, LEGACY_DHIKRS);

  assert.deepEqual(migrated.dailyCounts, {
    '2026-09-17': 5,
    '2026-09-18': 7,
  });
});

test('current-version daily aggregates remain unchanged during migration', () => {
  const currentVersionState = {
    ...DEFAULT_STATE,
    dhikrs: LEGACY_DHIKRS.slice(0, 1),
    dailyCounts: { '2026-09-18': 4 },
    dailyCountsByDhikr: { subhanallah: { '2026-09-18': 2 } },
    lifetimeCountsByDhikr: { subhanallah: 12 },
  };
  const migrated = migrateStoredState(currentVersionState, DEFAULT_STATE, LEGACY_DHIKRS);

  assert.deepEqual(migrated.dailyCounts, currentVersionState.dailyCounts);
  assert.deepEqual(migrated.dailyCountsByDhikr, currentVersionState.dailyCountsByDhikr);
});

test('aggregate daily totals take precedence over per-Dhikr copies', () => {
  const date = new Date(2026, 8, 18, 12, 0, 0);
  const stats = calculateStats(
    {
      '2026-09-12': 100,
      '2026-09-17': 5,
      '2026-09-18': 4,
    },
    321,
    date,
    {
      subhanallah: { '2026-09-18': 2 },
      alhamdulillah: { '2026-09-13': 3, '2026-09-19': 50 },
    },
  );

  assert.deepEqual(stats, { today: 4, thisWeek: 12, total: 321 });
});

test('target feedback takes precedence over milestone feedback', () => {
  assert.equal(getCountFeedback(33, 33), 'target');
  assert.equal(getCountFeedback(99, 99), 'target');
  assert.equal(getCountFeedback(100, null), 'milestone');
  assert.equal(getCountFeedback(34, 33), 'tap');
});

test('counting waits for hydration, stops at a target, and honors maximum count', () => {
  assert.equal(canAcceptCount(0, null, false, false), false);
  assert.equal(canAcceptCount(0, null, false, true), true);
  assert.equal(shouldStopCounting(10, 10, true), true);
  assert.equal(canAcceptCount(10, 10, true, true), false);
  assert.equal(canAcceptCount(10, 10, false, true), true);
  assert.equal(canAcceptCount(999998, null, false, true), true);
  assert.equal(canAcceptCount(999999, null, false, true), false);
});

test('LCD font size keeps three through six digit counts visible', () => {
  assert.equal(getLcdFontSize(93), 55);
  assert.equal(getLcdFontSize(999), 55);
  assert.equal(getLcdFontSize(1000), 46);
  assert.equal(getLcdFontSize(9999), 46);
  assert.equal(getLcdFontSize(10000), 38);
  assert.equal(getLcdFontSize(99999), 38);
  assert.equal(getLcdFontSize(100000), 32);
  assert.equal(getLcdFontSize(999999), 32);
});

test('Dhikr switching forces a new history session boundary', () => {
  const last = { id: 'session-1', dhikr: 'SubhanAllah', dhikrId: 'subhanallah', repetitions: 4, time: '8:15 AM', date: '2026-09-18' };
  assert.equal(canContinueHistorySession('session-1', last, 'subhanallah', '2026-09-18'), true);
  assert.equal(canContinueHistorySession(null, last, 'subhanallah', '2026-09-18'), false);
  assert.equal(canContinueHistorySession('session-1', last, 'alhamdulillah', '2026-09-18'), false);
});

test('automatic persistence always keeps the latest practice state', () => {
  const savedState: AppState = {
    ...DEFAULT_STATE,
    dhikrs: [{ id: 'subhanallah', name: 'SubhanAllah', icon: 'circle-double' }],
    selectedId: 'subhanallah',
    counters: { subhanallah: 12 },
    dailyCounts: { '2026-09-18': 12 },
    dailyCountsByDhikr: { subhanallah: { '2026-09-18': 12 } },
    lifetimeCount: 12,
    autoSave: false,
    history: [{ id: 'session-1', dhikr: 'SubhanAllah', dhikrId: 'subhanallah', repetitions: 12, time: '8:15 AM', date: '2026-09-18' }],
  };
  const savedPractice = getPracticeSnapshot(savedState);
  const unsavedState: AppState = {
    ...savedState,
    dhikrs: [{ ...savedState.dhikrs[0], name: 'Morning SubhanAllah' }],
    vibration: false,
    counters: { subhanallah: 19 },
    dailyCounts: { '2026-09-18': 19 },
    dailyCountsByDhikr: { subhanallah: { '2026-09-18': 19 } },
    lifetimeCount: 19,
    history: [{ ...savedState.history[0], repetitions: 19, time: '8:30 AM' }],
  };

  const persistedBeforeSave = getStateForPersistence(unsavedState, savedPractice);

  assert.deepEqual(persistedBeforeSave.counters, unsavedState.counters);
  assert.deepEqual(persistedBeforeSave.dailyCounts, unsavedState.dailyCounts);
  assert.deepEqual(persistedBeforeSave.dailyCountsByDhikr, unsavedState.dailyCountsByDhikr);
  assert.equal(persistedBeforeSave.lifetimeCount, unsavedState.lifetimeCount);
  assert.deepEqual(persistedBeforeSave.history, unsavedState.history);
  assert.deepEqual(persistedBeforeSave.dhikrs, unsavedState.dhikrs);
  assert.equal(persistedBeforeSave.vibration, false);
  assert.equal(persistedBeforeSave.autoSave, true);

  const hydratedAfterRestart = restoreStoredState(persistedBeforeSave, DEFAULT_STATE);
  assert.deepEqual(hydratedAfterRestart.counters, unsavedState.counters);
  assert.deepEqual(hydratedAfterRestart.dailyCounts, unsavedState.dailyCounts);
  assert.deepEqual(hydratedAfterRestart.dailyCountsByDhikr, unsavedState.dailyCountsByDhikr);
  assert.equal(hydratedAfterRestart.lifetimeCount, unsavedState.lifetimeCount);
  assert.deepEqual(hydratedAfterRestart.history, unsavedState.history);
  assert.deepEqual(hydratedAfterRestart.dhikrs, unsavedState.dhikrs);
  assert.equal(hydratedAfterRestart.vibration, false);
});

test('rapid persistence coalesces queued writes and restores the final state after restart', async () => {
  const writes: number[] = [];
  let releaseFirstWrite: () => void = () => undefined;
  const firstWriteFinished = new Promise<void>((resolve) => {
    releaseFirstWrite = resolve;
  });
  const persister = createLatestStatePersister<number>(async (state) => {
    writes.push(state);
    if (state === 1) await firstWriteFinished;
  });

  const first = persister.enqueue(1);
  await Promise.resolve();
  const second = persister.enqueue(2);
  const third = persister.enqueue(3);
  releaseFirstWrite();
  await Promise.all([first, second, third]);

  assert.deepEqual(writes, [1, 3]);
  const storage = new Map([[STORAGE_KEY, JSON.stringify({
    ...DEFAULT_STATE,
    dhikrs: LEGACY_DHIKRS.slice(0, 1),
    selectedId: 'subhanallah',
    counters: { subhanallah: 999999 },
    dailyCounts: { '2026-09-18': 999999 },
    dailyCountsByDhikr: { subhanallah: { '2026-09-18': 999999 } },
    lifetimeCount: 999999,
    lifetimeCountsByDhikr: { subhanallah: 999999 },
  })]]);
  const restored = await simulateAppRestart(storage);
  assert.equal(restored.counters.subhanallah, 999999);
  assert.equal(restored.lifetimeCountsByDhikr.subhanallah, 999999);
});

test('migration filters malformed history without discarding valid sessions', () => {
  const migrated = migrateStoredState({
    ...DEFAULT_STATE,
    dhikrs: LEGACY_DHIKRS.slice(0, 1),
    history: [
      { id: 'valid', dhikr: 'SubhanAllah', repetitions: 3, time: '8:15 AM', date: '2026-09-18' },
      null,
      { id: 'missing-count', dhikr: 'SubhanAllah', time: '8:16 AM' },
      { id: 'bad-date', dhikr: 'SubhanAllah', repetitions: 2, time: '8:17 AM', date: 'not-a-date' },
    ],
  }, DEFAULT_STATE, LEGACY_DHIKRS);
  assert.deepEqual(migrated.history, [{ id: 'valid', dhikr: 'SubhanAllah', dhikrId: 'subhanallah', repetitions: 3, time: '8:15 AM', date: '2026-09-18' }]);
});
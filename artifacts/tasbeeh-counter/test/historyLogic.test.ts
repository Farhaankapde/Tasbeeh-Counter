import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mock, test } from 'node:test';
import React from 'react';
import { groupHistoryEntries, getHistoryDateSection } from '../lib/historyLogic.ts';
import { getStateForPersistence, restoreStoredState, type AppState, type DhikrRecord, type HistoryEntry } from '../lib/counterLogic.ts';

const DHIKRS: DhikrRecord[] = [
  { id: 'subhanallah', name: 'SubhanAllah', icon: 'circle-double' },
  { id: 'alhamdulillah', name: 'Alhamdulillah', icon: 'flower-tulip' },
];

const DEFAULT_STATE: AppState = {
  dhikrs: [],
  selectedId: '',
  anonymousCount: 0,
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

const HISTORY_FIXTURE: AppState = {
  ...DEFAULT_STATE,
  dhikrs: DHIKRS,
  selectedId: 'subhanallah',
  history: [
    session('session-2', 'SubhanAllah', 9, '2026-09-18', 'subhanallah'),
    session('session-1', 'SubhanAllah', 4, '2026-09-18', 'subhanallah'),
    session('other-session', 'Alhamdulillah', 3, '2026-09-18', 'alhamdulillah'),
  ],
};

let storedAppState = JSON.stringify(HISTORY_FIXTURE);

const require = createRequire(import.meta.url);
require.extensions['.wav'] = () => {};
require.extensions['.png'] = () => {};

const hostComponent = (name: string) => (props: Record<string, unknown>) => React.createElement(name, props, props.children as React.ReactNode);
const HostView = hostComponent('View');
const HostText = hostComponent('Text');
const HostPressable = hostComponent('Pressable');
const HostScrollView = hostComponent('ScrollView');
const HostImage = hostComponent('Image');
const HostTextInput = hostComponent('TextInput');
const HostSwitch = hostComponent('Switch');
const MockAnimatedValue = class {
  constructor(public value: number) {}
  setValue(value: number) { this.value = value; }
  interpolate(config: { inputRange: number[]; outputRange: string[] }) { return config.outputRange[0]; }
};
mock.module('react-native', {
  namedExports: {
    Animated: {
      Value: MockAnimatedValue,
      Text: HostText,
      timing: () => ({ start: () => undefined }),
    },
    AppState: { addEventListener: () => ({ remove: () => undefined }) },
    BackHandler: { addEventListener: () => ({ remove: () => undefined }) },
    Easing: { out: (value: unknown) => value, quad: () => undefined },
    Image: HostImage,
    Modal: ({ visible, children, ...props }: { visible: boolean; children?: React.ReactNode }) => visible ? React.createElement('Modal', props, children) : null,
    Platform: { OS: 'ios' },
    Pressable: HostPressable,
    ScrollView: HostScrollView,
    StatusBar: () => null,
    StyleSheet: { create: <T,>(styles: T) => styles, flatten: (style: unknown) => style },
    Switch: HostSwitch,
    Text: HostText,
    TextInput: HostTextInput,
    View: HostView,
    useWindowDimensions: () => ({ width: 400, height: 800, scale: 1, fontScale: 1 }),
  },
});
mock.module('react-native-keyboard-controller', {
  namedExports: {
    KeyboardAvoidingView: HostView,
    KeyboardAwareScrollView: HostScrollView,
  },
});
const mockIcon = ({ name }: { name: string }) => React.createElement('Text', null, name);
const iconWithGlyphMap = Object.assign(mockIcon, { glyphMap: {} });
mock.module('@react-native-async-storage/async-storage', {
  defaultExport: {
    getItem: async () => storedAppState,
    setItem: async (_key: string, value: string) => { storedAppState = value; },
    removeItem: async () => undefined,
  },
});
mock.module('expo-audio', {
  namedExports: {
    setAudioModeAsync: async () => undefined,
    useAudioPlayer: () => ({
      isLoaded: true,
      volume: 1,
      seekTo: async () => undefined,
      play: () => undefined,
    }),
  },
});
mock.module('expo-haptics', {
  namedExports: {
    selectionAsync: async () => undefined,
    notificationAsync: async () => undefined,
    impactAsync: async () => undefined,
    NotificationFeedbackType: { Success: 'success' },
    ImpactFeedbackStyle: { Medium: 'medium', Light: 'light' },
  },
});
mock.module('@expo/vector-icons', { namedExports: { Feather: iconWithGlyphMap, MaterialCommunityIcons: iconWithGlyphMap } });
mock.module('expo-linear-gradient', {
  namedExports: {
    LinearGradient: ({ children, style }: { children: React.ReactNode; style?: unknown }) => React.createElement('View', { style }, children),
  },
});
mock.module('react-native-safe-area-context', {
  namedExports: { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) },
});

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

test('empty install counts immediately, persists anonymously, and still allows adding a Dhikr', async () => {
  storedAppState = JSON.stringify({ ...DEFAULT_STATE, dhikrs: [], selectedId: '', anonymousCount: 0 });
  try {
    const { fireEvent, render, waitFor } = await import('@testing-library/react-native/pure');
    const { default: HomeScreen } = await import('../app/index.tsx');
    const screen = await render(React.createElement(HomeScreen));

    await waitFor(() => assert.ok(screen.getByTestId('tasbeeh-button')));
    assert.ok(screen.getAllByText('Tasbeeh').length > 0);
    assert.equal(screen.queryByText('Start your library'), null);
    assert.equal(screen.queryByTestId('empty-add-dhikr'), null);

    await fireEvent.press(screen.getByTestId('tasbeeh-button'));
    await waitFor(() => assert.ok(screen.getByText('001')));
    const savedAfterCount = JSON.parse(storedAppState) as AppState;
    assert.deepEqual(savedAfterCount.dhikrs, []);
    assert.equal(savedAfterCount.anonymousCount, 1);
    assert.equal(savedAfterCount.lifetimeCount, 1);

    await screen.unmount();
    const restarted = await render(React.createElement(HomeScreen));
    await waitFor(() => assert.ok(restarted.getByText('001')));
    await fireEvent.press(restarted.getByTestId('open-dhikrs'));
    await waitFor(() => assert.ok(restarted.getByText('Your Dhikr Library is Empty')));

    await fireEvent.press(restarted.getByTestId('add-dhikr'));
    await fireEvent.changeText(restarted.getByTestId('dhikr-name-input'), 'SubhanAllah');
    await fireEvent.press(restarted.getByTestId('save-dhikr'));
    await waitFor(() => assert.ok(restarted.getByText('SubhanAllah')));

    const savedAfterDhikr = JSON.parse(storedAppState) as AppState;
    assert.equal(savedAfterDhikr.dhikrs.length, 1);
    assert.equal(savedAfterDhikr.dhikrs[0]?.name, 'SubhanAllah');
    await restarted.unmount();
  } finally {
    storedAppState = JSON.stringify(HISTORY_FIXTURE);
  }
});

test('Sandalwood Classic is selectable from Settings and persists across restart', async () => {
  storedAppState = JSON.stringify(DEFAULT_STATE);
  try {
    const { fireEvent, render, waitFor } = await import('@testing-library/react-native/pure');
    const { default: HomeScreen } = await import('../app/index.tsx');
    const screen = await render(React.createElement(HomeScreen));

    await fireEvent.press(screen.getByLabelText('Open settings'));
    await waitFor(() => assert.ok(screen.getByTestId('accent-theme-sandalwood')));
    await fireEvent.press(screen.getByTestId('accent-theme-sandalwood'));
    await waitFor(() => assert.equal((JSON.parse(storedAppState) as AppState).accentTheme, 'sandalwood'));
    assert.ok(screen.getByText('Selected'));
    await screen.unmount();
  } finally {
    storedAppState = JSON.stringify(HISTORY_FIXTURE);
  }
});

test('Arabesque White is selectable from Settings and persists across restart', async () => {
  storedAppState = JSON.stringify(DEFAULT_STATE);
  try {
    const { fireEvent, render, waitFor } = await import('@testing-library/react-native/pure');
    const { default: HomeScreen } = await import('../app/index.tsx');
    const screen = await render(React.createElement(HomeScreen));

    await fireEvent.press(screen.getByLabelText('Open settings'));
    await waitFor(() => assert.ok(screen.getByTestId('accent-theme-arabesque-white')));
    await fireEvent.press(screen.getByTestId('accent-theme-arabesque-white'));
    await waitFor(() => assert.equal((JSON.parse(storedAppState) as AppState).accentTheme, 'arabesque-white'));
    assert.ok(screen.getByText('Selected'));
    await screen.unmount();
  } finally {
    storedAppState = JSON.stringify(HISTORY_FIXTURE);
  }
});

test('History tab drills into every grouped session and returns to the overview', async () => {
  const { fireEvent, render, waitFor } = await import('@testing-library/react-native/pure');
  const { default: HomeScreen } = await import('../app/index.tsx');
  const screen = await render(React.createElement(HomeScreen));

  await fireEvent.press(screen.getByTestId('open-history'));
  await waitFor(() => assert.ok(screen.getByTestId('history-group-2026-09-18:subhanallah')));
  assert.ok(screen.getByLabelText('View SubhanAllah sessions'));
  assert.ok(screen.getByLabelText('View Alhamdulillah sessions'));

  await fireEvent.press(screen.getByTestId('history-group-2026-09-18:subhanallah'));
  assert.ok(screen.getByText('SubhanAllah'));
  assert.ok(screen.getByText('9 repetitions'));
  assert.ok(screen.getByText('4 repetitions'));
  assert.equal(screen.queryByTestId('history-group-2026-09-18:subhanallah'), null);

  await fireEvent.press(screen.getByTestId('history-overview'));
  assert.ok(screen.getByTestId('history-group-2026-09-18:subhanallah'));
  assert.ok(screen.getByLabelText('View Alhamdulillah sessions'));

  await screen.unmount();
});

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

test('persistence retains more than 30 individual history sessions', () => {
  const history = Array.from({ length: 35 }, (_, index) => session(`session-${index}`, 'SubhanAllah', index + 1, '2026-09-18', 'subhanallah'));
  const state: AppState = { ...DEFAULT_STATE, dhikrs: DHIKRS, selectedId: 'subhanallah', history };
  const persisted = getStateForPersistence(state, { ...DEFAULT_STATE, history });
  const restored = restoreStoredState(JSON.parse(JSON.stringify(persisted)), DEFAULT_STATE);
  assert.equal(restored.history.length, 35);
  assert.deepEqual(restored.history.map((entry) => entry.id), history.map((entry) => entry.id));
});

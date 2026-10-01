import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
const layoutSource = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
const keyboardControllerAndroidPatch = readFileSync(new URL('../../../patches/react-native-keyboard-controller@1.21.9.patch', import.meta.url), 'utf8');

test('counter screen remains fixed and does not introduce a scrolling container', () => {
  const counterStart = appSource.indexOf("{activeTab === 'counter' ?");
  const secondaryStart = appSource.indexOf(': <SecondaryTab', counterStart);
  assert.ok(counterStart >= 0);
  assert.ok(secondaryStart > counterStart);
  const counterSource = appSource.slice(counterStart, secondaryStart);

  assert.doesNotMatch(counterSource, /<ScrollView|<FlatList|<SectionList|<VirtualizedList/);
  assert.match(counterSource, /styles\.counterScroll/);
  assert.match(counterSource, /pointerEvents="box-none"/);
  assert.match(appSource, /paddingBottom: Math\.max\(bottomInset, 9\), zIndex: 40/);
  assert.match(appSource, /<TabBar/);
});

test('persisted state controls are hydration-gated', () => {
  assert.match(appSource, /disabled=\{!hydrated\}/);
  assert.match(appSource, /stateReady=\{hydrated\}/);
  assert.match(appSource, /if \(!hydrated\) return;/);
  assert.match(appSource, /PERSISTENCE_READ_TIMEOUT_MS/);
  assert.match(appSource, /withTimeout\(retryAsync/);
});

test('Android keyboard event view passes touches through without disabling keyboard handling', () => {
  assert.match(layoutSource, /<KeyboardProvider>/);
  assert.match(keyboardControllerAndroidPatch, /pointerEvents = PointerEvents\.NONE/);
});

test('counter taps reach increment through an enabled accessible Pressable', () => {
  assert.match(appSource, /testID="tasbeeh-button"[^>]*accessibilityRole="button"/);
  assert.match(appSource, /disabled=\{disabled\} onPress=\{onPress\}/);
  assert.match(appSource, /onPress=\{increment\}/);
  assert.match(appSource, /lifetimeCount: previous\.lifetimeCount \+ 1/);
});

test('Android Back listener is focused, handles app-owned states, and cleans up', () => {
  assert.match(appSource, /useFocusEffect\(useCallback\(/);
  assert.match(appSource, /handleAndroidBack\(/);
  assert.match(appSource, /return \(\) => subscription\.remove\(\)/);
});

test('first launch cannot remain blocked by font or bundled asset loading', () => {
  assert.match(layoutSource, /FONT_LOAD_TIMEOUT_MS/);
  assert.match(layoutSource, /fontLoadTimedOut/);
  assert.match(appSource, /useState\(true\)/);
  assert.doesNotMatch(appSource, /setCounterAssetsReady\(false\)/);
});

test('Arabesque White keeps one shared hardware counter overlay and aligned assets', () => {
  assert.match(appSource, /realistic-counter-arabesque-white-aligned\.webp/);
  assert.match(appSource, /counter-dial-arabesque-white-aligned\.webp/);
  assert.equal((appSource.match(/testID="counter-display"/g) ?? []).length, 1);
});

test('click audio preloads and restarts without an awaited seek on every tap', () => {
  assert.match(appSource, /useAudioPlayer\(require\('\.\.\/assets\/sounds\/tap\.wav'\), \{ downloadFirst: true \}\)/);
  assert.match(appSource, /player\.currentTime = 0/);
  assert.match(appSource, /queuedTapSounds/);
});
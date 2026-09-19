import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');

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
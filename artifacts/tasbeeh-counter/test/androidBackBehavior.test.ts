import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleAndroidBack, type AndroidBackActions, type AndroidBackState } from '../lib/androidBackBehavior';

const initialState: AndroidBackState = {
  activeTab: 'counter',
  historyGroupKey: null,
  selectorOpen: false,
  settingsOpen: false,
  resetting: false,
  dhikrEditorOpen: false,
  deleteDhikrId: null,
};

function makeActions(calls: string[]): AndroidBackActions {
  return {
    closeSelector: () => calls.push('selector'),
    closeSettings: () => calls.push('settings'),
    closeReset: () => calls.push('reset'),
    closeDhikrEditor: () => calls.push('editor'),
    closeDeleteConfirmation: () => calls.push('delete'),
    closeHistoryGroup: () => calls.push('history-group'),
    returnToCounter: () => calls.push('counter'),
  };
}

test('Android Back closes only the highest-priority open overlay', () => {
  const calls: string[] = [];
  const handled = handleAndroidBack(
    { ...initialState, resetting: true, deleteDhikrId: 'dhikr-1', settingsOpen: true },
    makeActions(calls),
  );
  assert.equal(handled, true);
  assert.deepEqual(calls, ['reset']);
});

test('Android Back respects overlay stacking when more than one state is active', () => {
  const calls: string[] = [];
  const handled = handleAndroidBack(
    { ...initialState, settingsOpen: true, deleteDhikrId: 'dhikr-1' },
    makeActions(calls),
  );
  assert.equal(handled, true);
  assert.deepEqual(calls, ['settings']);
});

test('Android Back closes the active history drill-down before changing tabs', () => {
  const calls: string[] = [];
  const handled = handleAndroidBack(
    { ...initialState, activeTab: 'history', historyGroupKey: '2026-10-01' },
    makeActions(calls),
  );
  assert.equal(handled, true);
  assert.deepEqual(calls, ['history-group']);
});

test('Android Back returns secondary tabs to Counter', () => {
  const calls: string[] = [];
  const handled = handleAndroidBack(
    { ...initialState, activeTab: 'stats' },
    makeActions(calls),
  );
  assert.equal(handled, true);
  assert.deepEqual(calls, ['counter']);
});

test('Android Back delegates the Counter root action to the platform', () => {
  const calls: string[] = [];
  const handled = handleAndroidBack(initialState, makeActions(calls));
  assert.equal(handled, false);
  assert.deepEqual(calls, []);
});
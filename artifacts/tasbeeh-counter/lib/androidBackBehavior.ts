export type AndroidBackState = {
  activeTab: 'counter' | 'history' | 'stats' | 'dhikrs';
  historyGroupKey: string | null;
  selectorOpen: boolean;
  settingsOpen: boolean;
  resetting: boolean;
  dhikrEditorOpen: boolean;
  deleteDhikrId: string | null;
};

export type AndroidBackActions = {
  closeSelector: () => void;
  closeSettings: () => void;
  closeReset: () => void;
  closeDhikrEditor: () => void;
  closeDeleteConfirmation: () => void;
  closeHistoryGroup: () => void;
  returnToCounter: () => void;
};

/**
 * Handle app-owned Android back states. Returning false on the counter screen
 * intentionally lets React Native/Android perform the platform default action.
 */
export function handleAndroidBack(
  state: AndroidBackState,
  actions: AndroidBackActions,
): boolean {
  if (state.resetting) {
    actions.closeReset();
    return true;
  }
  if (state.settingsOpen) {
    actions.closeSettings();
    return true;
  }
  if (state.deleteDhikrId !== null) {
    actions.closeDeleteConfirmation();
    return true;
  }
  if (state.dhikrEditorOpen) {
    actions.closeDhikrEditor();
    return true;
  }
  if (state.selectorOpen) {
    actions.closeSelector();
    return true;
  }
  if (state.activeTab === 'history' && state.historyGroupKey !== null) {
    actions.closeHistoryGroup();
    return true;
  }
  if (state.activeTab !== 'counter') {
    actions.returnToCounter();
    return true;
  }
  return false;
}
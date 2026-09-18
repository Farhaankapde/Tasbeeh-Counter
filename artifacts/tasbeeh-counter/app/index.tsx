import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';
import { calculateStats, canAcceptCount, getCountFeedback, getLocalDateKey, getPracticeSnapshot, getStateForPersistence, restoreStoredState, type AppState, type DhikrRecord, type PracticeSnapshot } from '@/lib/counterLogic';
import { getHistoryDateSection, groupHistoryEntries } from '@/lib/historyLogic';

type Dhikr = DhikrRecord & { icon: keyof typeof MaterialCommunityIcons.glyphMap };
const STORAGE_KEY = 'tasbeeh-counter-state-v1';
const LEGACY_DHIKRS: Dhikr[] = [
  { id: 'subhanallah', name: 'SubhanAllah', arabic: 'سُبْحَانَ ٱللَّٰهِ', icon: 'circle-double' },
  { id: 'alhamdulillah', name: 'Alhamdulillah', arabic: 'ٱلْحَمْدُ لِلَّٰهِ', icon: 'flower-tulip' },
  { id: 'allahu-akbar', name: 'Allahu Akbar', arabic: 'ٱللَّٰهُ أَكْبَرُ', icon: 'star-four-points' },
  { id: 'la-ilaha', name: 'La ilaha illallah', arabic: 'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ', icon: 'infinity' },
  { id: 'astaghfirullah', name: 'Astaghfirullah', arabic: 'أَسْتَغْفِرُ ٱللَّٰهَ', icon: 'water-outline' },
  { id: 'subhanallahi', name: 'SubhanAllahi wa bihamdihi', arabic: 'سُبْحَانَ ٱللَّٰهِ وَبِحَمْدِهِ', icon: 'weather-sunny' },
];
const DEFAULT_STATE: AppState = { dhikrs: [], selectedId: '', counters: {}, targets: {}, dailyCounts: {}, dailyCountsByDhikr: {}, lifetimeCount: 0, vibration: true, sound: true, counterAnimation: true, autoSave: true, stopAtTarget: false, theme: 'dark', history: [] };
type Palette = typeof colors.dark | typeof colors.light;

type Tab = 'counter' | 'history' | 'stats' | 'dhikrs';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [appState, setAppState] = useState<AppState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('counter');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [dhikrEditorOpen, setDhikrEditorOpen] = useState(false);
  const [editingDhikrId, setEditingDhikrId] = useState<string | null>(null);
  const [dhikrNameDraft, setDhikrNameDraft] = useState('');
  const [dhikrTargetDraft, setDhikrTargetDraft] = useState('');
  const [dhikrCustomTargetOpen, setDhikrCustomTargetOpen] = useState(false);
  const [deleteDhikrId, setDeleteDhikrId] = useState<string | null>(null);
  const [completionFlash, setCompletionFlash] = useState(false);
  const appStateRef = useRef<AppState>(DEFAULT_STATE);
  const scale = useRef(new Animated.Value(1)).current;
  const tapSound = useRef<Audio.Sound | null>(null);
  const completionSound = useRef<Audio.Sound | null>(null);
  const webAudio = useRef<AudioContext | null>(null);
  const savedPractice = useRef<PracticeSnapshot>(getPracticeSnapshot(DEFAULT_STATE));
  const storageWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const feedbackTriggered = useRef(new Set<string>());
  const activeHistorySessionId = useRef<string | null>(null);
  const palette = appState.theme === 'light' ? colors.light : colors.dark;
  const selectedDhikr = useMemo(() => appState.dhikrs.find((item) => item.id === appState.selectedId) ?? appState.dhikrs[0] ?? ({ id: '', name: 'Dhikr', arabic: '', icon: 'circle-double' } as Dhikr), [appState.dhikrs, appState.selectedId]);
  const currentCount = selectedDhikr ? appState.counters[selectedDhikr.id] ?? 0 : 0;
  const selectedTarget = selectedDhikr ? appState.targets[selectedDhikr.id] ?? null : null;
  const stats = calculateStats(appState.dailyCounts, appState.lifetimeCount, new Date(), appState.dailyCountsByDhikr);
  const todayCount = stats.today;
  const weekCount = stats.thisWeek;
  const totalCount = stats.total;
  const deviceWidth = Math.min(Math.max((width - 34) * 1.08, 320), 400);
  const targetProgress = selectedTarget ? Math.min(currentCount / selectedTarget, 1) : 0;

  const updateAppState = (updater: (previous: AppState) => AppState) => {
    const next = updater(appStateRef.current);
    appStateRef.current = next;
    setAppState(next);
    return next;
  };

  const queuePersist = (state: AppState) => {
    storageWriteQueue.current = storageWriteQueue.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)));
    return storageWriteQueue.current;
  };

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (active) {
          const migrated = restoreStoredState(raw ? JSON.parse(raw) as unknown : null, DEFAULT_STATE, LEGACY_DHIKRS);
          appStateRef.current = migrated;
          savedPractice.current = getPracticeSnapshot(migrated);
          setAppState(migrated);
        }
      } catch {
        // The default state keeps the core counter usable offline.
      } finally {
        if (active) setHydrated(true);
      }
    };
    void hydrate();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const prepareSound = async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
        const [tapResult, completionResult] = await Promise.all([
          Audio.Sound.createAsync(require('../assets/sounds/tap.wav'), { shouldPlay: false, volume: 0.42 }),
          Audio.Sound.createAsync(require('../assets/sounds/completion.wav'), { shouldPlay: false, volume: 0.55 }),
        ]);
        if (active) {
          tapSound.current = tapResult.sound;
          completionSound.current = completionResult.sound;
        } else {
          await Promise.all([tapResult.sound.unloadAsync(), completionResult.sound.unloadAsync()]);
        }
      } catch {
        // The web oscillator below remains a graceful fallback.
      }
    };
    void prepareSound();
    return () => {
      active = false;
      if (tapSound.current) void tapSound.current.unloadAsync();
      if (completionSound.current) void completionSound.current.unloadAsync();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (appState.autoSave) savedPractice.current = getPracticeSnapshot(appState);
    void queuePersist(getStateForPersistence(appState, savedPractice.current));
  }, [appState, hydrated]);

  const playClick = async () => {
    if (tapSound.current) {
      try { await tapSound.current.replayAsync(); return; } catch { /* use web oscillator */ }
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        if (!webAudio.current) webAudio.current = new AudioCtor();
        const context = webAudio.current;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 840;
        gain.gain.setValueAtTime(0.045, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.055);
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.06);
      } catch { /* sound never blocks counting */ }
    }
  };

  const playCompletion = async () => {
    if (completionSound.current) {
      try { await completionSound.current.replayAsync(); return; } catch { /* use web oscillator */ }
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        if (!webAudio.current) webAudio.current = new AudioCtor();
        const context = webAudio.current;
        [660, 880].forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const start = context.currentTime + index * 0.1;
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.055, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + 0.2);
        });
      } catch { /* completion feedback never blocks counting */ }
    }
  };

  const increment = () => {
    const previous = appStateRef.current;
    const dhikr = previous.dhikrs.find((item) => item.id === previous.selectedId) ?? previous.dhikrs[0];
    if (!dhikr) return;
    const count = previous.counters[dhikr.id] ?? 0;
    const target = previous.targets[dhikr.id] ?? null;
    if (!canAcceptCount(count, target, previous.stopAtTarget, hydrated)) {
      if (previous.vibration) void Haptics.selectionAsync();
      return;
    }
    const nextCount = Math.min(999999, count + 1);
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const date = getLocalDateKey();
    const targetFeedbackKey = `target:${dhikr.id}:${target}`;
    const feedback = getCountFeedback(nextCount, target);
    const reachedTarget = feedback === 'target' && !feedbackTriggered.current.has(targetFeedbackKey);
    const milestone = feedback === 'milestone';
    const milestoneFeedbackKey = `milestone:${dhikr.id}:${nextCount}`;
    const last = previous.history[0];
    const canContinueSession = Boolean(last && activeHistorySessionId.current === last.id && last.dhikrId === dhikr.id && last.date === date);
    const sessionId = canContinueSession ? last!.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextHistory = canContinueSession
      ? [{ ...last, repetitions: last.repetitions + 1, time, date }, ...previous.history.slice(1)]
      : [{ id: sessionId, dhikr: dhikr.name, dhikrId: dhikr.id, repetitions: 1, time, date }, ...previous.history].slice(0, 30);
    activeHistorySessionId.current = sessionId;
    updateAppState(() => ({
      ...previous,
      counters: { ...previous.counters, [dhikr.id]: nextCount },
      dailyCounts: previous.dailyCounts,
      dailyCountsByDhikr: {
        ...previous.dailyCountsByDhikr,
        [dhikr.id]: { ...(previous.dailyCountsByDhikr[dhikr.id] ?? {}), [date]: (previous.dailyCountsByDhikr[dhikr.id]?.[date] ?? 0) + 1 },
      },
      lifetimeCount: previous.lifetimeCount + 1,
      history: nextHistory,
    }));
    if (reachedTarget) {
      feedbackTriggered.current.add(targetFeedbackKey);
      if (previous.vibration) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (previous.sound) void playCompletion();
      setCompletionFlash(true);
      setTimeout(() => setCompletionFlash(false), 1300);
    } else {
      if (milestone) {
        if (!feedbackTriggered.current.has(milestoneFeedbackKey)) {
          feedbackTriggered.current.add(milestoneFeedbackKey);
          if (previous.vibration) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      } else if (previous.vibration) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      if (previous.sound) void playClick();
    }
    if (previous.counterAnimation) {
      scale.setValue(reachedTarget ? 0.91 : milestone ? 0.93 : 0.96);
      Animated.timing(scale, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
  };

  const changeSetting = <K extends keyof AppState>(key: K, value: AppState[K]) => updateAppState((previous) => ({ ...previous, [key]: value }));
  const resetCurrent = () => {
    if (!selectedDhikr) return;
    const id = appStateRef.current.selectedId;
    setResetting(false);
    activeHistorySessionId.current = null;
    [...feedbackTriggered.current].filter((key) => key.includes(`:${id}:`)).forEach((key) => feedbackTriggered.current.delete(key));
    setCompletionFlash(false);
    updateAppState((previous) => ({ ...previous, counters: { ...previous.counters, [id]: 0 } }));
  };
  const chooseDhikr = (id: string) => { updateAppState((previous) => ({ ...previous, selectedId: id })); setSelectorOpen(false); setActiveTab('counter'); };
  const makeDhikrId = () => `dhikr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const openDhikrEditor = (item?: DhikrRecord) => {
    setEditingDhikrId(item?.id ?? null);
    setDhikrNameDraft(item?.name ?? '');
    const target = item ? appStateRef.current.targets[item.id] ?? null : null;
    setDhikrTargetDraft(target ? String(target) : '');
    setDhikrCustomTargetOpen(Boolean(target));
    setDhikrEditorOpen(true);
  };
  const closeDhikrEditor = () => {
    setDhikrEditorOpen(false);
    setEditingDhikrId(null);
    setDhikrNameDraft('');
    setDhikrTargetDraft('');
    setDhikrCustomTargetOpen(false);
  };
  const saveDhikr = () => {
    const name = dhikrNameDraft.trim();
    if (!name) return;
    const target = dhikrTargetDraft === '' ? null : Number(dhikrTargetDraft);
    if (target !== null && (!Number.isInteger(target) || target < 1 || target > 999999)) return;
    const existing = editingDhikrId ? appStateRef.current.dhikrs.find((item) => item.id === editingDhikrId) : undefined;
    const id = editingDhikrId ?? makeDhikrId();
    const item: DhikrRecord = { ...(existing ?? {}), id, name, icon: existing?.icon ?? 'circle-double' };
    updateAppState((previous) => ({
      ...previous,
      dhikrs: editingDhikrId ? previous.dhikrs.map((entry) => entry.id === id ? item : entry) : [...previous.dhikrs, item],
      selectedId: previous.selectedId || id,
      counters: editingDhikrId ? previous.counters : { ...previous.counters, [id]: 0 },
      targets: { ...previous.targets, [id]: target },
    }));
    closeDhikrEditor();
  };
  const confirmDeleteDhikr = () => {
    if (!deleteDhikrId) return;
    const id = deleteDhikrId;
    updateAppState((previous) => {
      const dhikrs = previous.dhikrs.filter((item) => item.id !== id);
      const nextSelected = previous.selectedId === id ? dhikrs[0]?.id ?? '' : previous.selectedId;
      const counters = { ...previous.counters }; delete counters[id];
      const targets = { ...previous.targets }; delete targets[id];
      return { ...previous, dhikrs, selectedId: nextSelected, counters, targets };
    });
    setDeleteDhikrId(null);
  };
  const saveNow = async () => {
    const state = appStateRef.current;
    savedPractice.current = getPracticeSnapshot(state);
    await queuePersist(state);
    activeHistorySessionId.current = null;
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <LinearGradient colors={appState.theme === 'light' ? [palette.background, '#e9e4de', palette.background] : [palette.background, '#171211', palette.background]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.root}>
      <StatusBar barStyle={appState.theme === 'light' ? 'dark-content' : 'light-content'} />
      {activeTab === 'counter' ? appState.dhikrs.length > 0 ? <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: 104 + Math.max(insets.bottom, 14) }]}>
        <View style={styles.topBar}><IconButton icon="menu" label="Open menu" onPress={() => setMenuOpen(true)} palette={palette} /><Text style={[styles.greetingName, { color: palette.foreground }]}>Tasbeeh Counter</Text><IconButton icon="settings" label="Open settings" onPress={() => setSettingsOpen(true)} palette={palette} /></View>
         <View style={[styles.selector, styles.premiumSelector, { backgroundColor: palette.card, borderColor: completionFlash ? palette.primaryBright : palette.border }]}>
          <Pressable testID="dhikr-selector" accessibilityRole="button" accessibilityLabel={'Select Dhikr, currently ' + selectedDhikr.name} onPress={() => setSelectorOpen(true)} style={({ pressed: selectorPressed }) => [styles.selectorMain, { opacity: selectorPressed ? 0.82 : 1 }]}>
             <View style={[styles.selectorIcon, { backgroundColor: palette.primary }]}><MaterialCommunityIcons name={selectedDhikr.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={24} color={palette.primaryForeground} /></View>
            <View style={styles.selectorCopy}><Text style={[styles.selectorName, { color: palette.foreground }]}>{selectedDhikr.name}</Text><Text style={[styles.arabic, { color: palette.muted }]}>{selectedDhikr.arabic}</Text></View>
            <Feather name="chevron-down" size={20} color={palette.foreground} />
          </Pressable>
           {selectedTarget ? <View accessibilityLabel={`Target ${selectedTarget}`} style={[styles.targetPill, { backgroundColor: palette.primary }]}>
            <MaterialCommunityIcons name={completionFlash ? 'check-circle' : 'target'} size={14} color={selectedTarget ? palette.primaryForeground : palette.primaryBright} />
             <Text style={[styles.targetPillText, { color: palette.primaryForeground }]}>{`${currentCount} / ${selectedTarget}`}</Text>
           </View> : null}
           {selectedTarget ? <View style={[styles.selectorProgressTrack, { backgroundColor: palette.surfaceStrong }]}><View style={[styles.selectorProgress, { width: `${Math.round(targetProgress * 100)}%`, backgroundColor: completionFlash ? palette.primaryBright : palette.primary }]} /></View> : null}
        </View>
         <HardwareCounter count={currentCount} width={deviceWidth} palette={palette} scale={scale} pressed={pressed} completionFlash={completionFlash} disabled={!hydrated} onPress={increment} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} />
         <View style={[styles.actionBar, styles.premiumActionBar, { backgroundColor: palette.card, borderColor: palette.border }]}><Pressable testID="reset-counter" accessibilityRole="button" accessibilityLabel={'Reset ' + selectedDhikr.name + ' counter'} onPress={() => setResetting(true)} style={({ pressed: p }) => [styles.actionItem, p && styles.pressed]}><Feather name="rotate-ccw" size={20} color={palette.muted} /><Text style={[styles.actionText, { color: palette.foreground }]}>RESET</Text></Pressable><View style={[styles.actionDivider, { backgroundColor: palette.border }]} /><Pressable accessibilityRole="button" accessibilityLabel="Save count now" onPress={saveNow} style={({ pressed: p }) => [styles.actionItem, p && styles.pressed]}><Feather name={savedFlash ? 'check' : 'save'} size={20} color={savedFlash ? palette.primaryBright : palette.muted} /><Text style={[styles.actionText, { color: palette.foreground }]}>{savedFlash ? 'SAVED' : 'SAVE'}</Text></Pressable></View>
         </ScrollView> : <EmptyHome palette={palette} onAdd={() => { setActiveTab('dhikrs'); openDhikrEditor(); }} onSettings={() => setSettingsOpen(true)} /> : <SecondaryTab tab={activeTab} palette={palette} appState={appState} todayCount={todayCount} weekCount={weekCount} totalCount={totalCount} onChooseDhikr={chooseDhikr} onAddDhikr={() => openDhikrEditor()} onEditDhikr={openDhikrEditor} onDeleteDhikr={setDeleteDhikrId} />}
      <TabBar activeTab={activeTab} palette={palette} onChange={setActiveTab} bottomInset={insets.bottom} />

       <Modal visible={selectorOpen} transparent animationType="slide" onRequestClose={() => setSelectorOpen(false)}><View style={styles.modalRoot}><Pressable style={styles.modalBackdrop} onPress={() => setSelectorOpen(false)} /><View style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: Math.max(insets.bottom, 18) + 10 }]}><SheetHandle palette={palette} /><View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: palette.foreground }]}>Choose Dhikr</Text><Text style={[styles.sheetSubtitle, { color: palette.muted }]}>Each remembrance keeps its own count</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close Dhikr selector" onPress={() => setSelectorOpen(false)} style={[styles.closeButton, { backgroundColor: palette.surface }]}><Feather name="x" size={19} color={palette.foreground} /></Pressable></View>{appState.dhikrs.map((item, index) => { const active = item.id === selectedDhikr?.id; return <Pressable key={item.id} testID={'dhikr-option-' + item.id} accessibilityRole="button" accessibilityLabel={'Select ' + item.name} onPress={() => chooseDhikr(item.id)} style={({ pressed: p }) => [styles.option, { backgroundColor: active ? palette.primary : palette.surface, borderColor: active ? palette.primaryBright : palette.border, opacity: p ? 0.78 : 1 }]}><View style={[styles.optionIcon, { backgroundColor: active ? palette.primaryBright : palette.primary }]}><MaterialCommunityIcons name={item.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={19} color={palette.primaryForeground} /></View><View style={styles.optionCopy}><Text style={[styles.optionName, { color: palette.foreground }]}>{item.name}</Text><Text style={[styles.optionArabic, { color: palette.muted }]}>{item.arabic ?? ''}</Text></View><View style={styles.optionMeta}><Text style={[styles.optionCount, { color: active ? palette.primaryForeground : palette.muted }]}>{String(appState.counters[item.id] ?? 0).padStart(3, '0')}</Text>{active ? <Feather name="check" size={18} color={palette.primaryForeground} /> : <Text style={[styles.optionNumber, { color: palette.muted }]}>{String(index + 1).padStart(2, '0')}</Text>}</View></Pressable>; })}</View></View></Modal>

        <Modal visible={dhikrEditorOpen} transparent animationType="slide" onRequestClose={closeDhikrEditor}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={closeDhikrEditor} />
            <View style={[styles.sheet, styles.dhikrFormSheet, { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: Math.max(insets.bottom, 18) + 10 }]}>
              <SheetHandle palette={palette} />
              <View style={styles.sheetHeader}>
                <View><Text style={[styles.sheetTitle, { color: palette.foreground }]}>{editingDhikrId ? 'Edit Dhikr' : 'Add Dhikr'}</Text><Text style={[styles.sheetSubtitle, { color: palette.muted }]}>Name and target only</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close Dhikr form" onPress={closeDhikrEditor} style={[styles.closeButton, { backgroundColor: palette.surface }]}><Feather name="x" size={19} color={palette.foreground} /></Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.dhikrFormContent}>
                <TextInput testID="dhikr-name-input" accessibilityLabel="Dhikr name" value={dhikrNameDraft} onChangeText={setDhikrNameDraft} placeholder="Dhikr name *" placeholderTextColor={palette.muted} style={[styles.customTargetInput, { color: palette.foreground, backgroundColor: palette.surface, borderColor: palette.border }]} />
                <Text style={[styles.sectionLabel, { color: palette.muted, marginTop: 6 }]}>TARGET</Text>
                <View style={styles.targetPresetRow}>
                  <Pressable testID="dhikr-target-none" onPress={() => { setDhikrTargetDraft(''); setDhikrCustomTargetOpen(false); }} style={[styles.targetPreset, { backgroundColor: !dhikrCustomTargetOpen && dhikrTargetDraft === '' ? palette.primary : palette.surface, borderColor: palette.border }]}><Text style={[styles.targetPresetText, { color: !dhikrCustomTargetOpen && dhikrTargetDraft === '' ? palette.primaryForeground : palette.foreground }]}>None</Text></Pressable>
                  <Pressable testID="dhikr-target-custom" onPress={() => setDhikrCustomTargetOpen(true)} style={[styles.targetPreset, { backgroundColor: dhikrCustomTargetOpen ? palette.primary : palette.surface, borderColor: palette.border }]}><Text style={[styles.targetPresetText, { color: dhikrCustomTargetOpen ? palette.primaryForeground : palette.foreground }]}>Custom</Text></Pressable>
                </View>
                {dhikrCustomTargetOpen ? <TextInput testID="dhikr-custom-target-input" accessibilityLabel="Custom target" value={dhikrTargetDraft} onChangeText={(value) => setDhikrTargetDraft(value.replace(/[^0-9]/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="1–999999" placeholderTextColor={palette.muted} style={[styles.customTargetInput, { color: palette.foreground, backgroundColor: palette.surface, borderColor: palette.border }]} /> : null}
                <Pressable testID="save-dhikr" accessibilityRole="button" accessibilityLabel={editingDhikrId ? 'Save Dhikr changes' : 'Create Dhikr'} disabled={!dhikrNameDraft.trim() || (dhikrCustomTargetOpen && (!Number.isInteger(Number(dhikrTargetDraft)) || Number(dhikrTargetDraft) < 1 || Number(dhikrTargetDraft) > 999999))} onPress={saveDhikr} style={[styles.formSubmit, { backgroundColor: palette.primary, opacity: !dhikrNameDraft.trim() ? 0.45 : 1 }]}><Text style={[styles.targetPresetText, { color: palette.primaryForeground }]}>{editingDhikrId ? 'Save Changes' : 'Create Dhikr'}</Text></Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>
       <Modal visible={deleteDhikrId !== null} transparent animationType="fade" onRequestClose={() => setDeleteDhikrId(null)}><View style={styles.confirmRoot}><Pressable style={styles.modalBackdrop} onPress={() => setDeleteDhikrId(null)} /><View style={[styles.confirmCard, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={[styles.confirmIcon, { backgroundColor: palette.destructive }]}><Feather name="trash-2" size={22} color={palette.primaryForeground} /></View><Text style={[styles.confirmTitle, { color: palette.foreground }]}>Delete Dhikr?</Text><Text style={[styles.confirmBody, { color: palette.muted }]}>Its current count and target will be removed. History and lifetime totals stay safe.</Text><View style={styles.confirmActions}><Pressable accessibilityRole="button" accessibilityLabel="Cancel delete" onPress={() => setDeleteDhikrId(null)} style={[styles.confirmButton, { backgroundColor: palette.surface }]}><Text style={[styles.confirmButtonText, { color: palette.foreground }]}>Cancel</Text></Pressable><Pressable testID="confirm-delete-dhikr" accessibilityRole="button" accessibilityLabel="Confirm delete Dhikr" onPress={confirmDeleteDhikr} style={[styles.confirmButton, { backgroundColor: palette.destructive }]}><Text style={[styles.confirmButtonText, { color: palette.primaryForeground }]}>Delete</Text></Pressable></View></View></View></Modal>

      <Modal visible={settingsOpen} animationType="slide" onRequestClose={() => setSettingsOpen(false)}><View style={[styles.settingsRoot, { backgroundColor: palette.background, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 18) }]}><View style={styles.settingsHeader}><View><Text style={[styles.sheetTitle, { color: palette.foreground }]}>Settings</Text><Text style={[styles.sheetSubtitle, { color: palette.muted }]}>Make the practice feel like yours</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close settings" onPress={() => setSettingsOpen(false)} style={[styles.closeButton, { backgroundColor: palette.surface }]}><Feather name="x" size={19} color={palette.foreground} /></Pressable></View><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsScroll}><SettingsSection title="COUNTER" palette={palette}><SettingRow icon="vibrate" label="Vibration" value={appState.vibration} onValueChange={(value) => changeSetting('vibration', value)} palette={palette} /><SettingDivider palette={palette} /><SettingRow icon="volume-2" label="Sound" value={appState.sound} onValueChange={(value) => changeSetting('sound', value)} palette={palette} feather /><SettingDivider palette={palette} /><SettingRow icon="activity" label="Counter animation" value={appState.counterAnimation} onValueChange={(value) => changeSetting('counterAnimation', value)} palette={palette} feather /><SettingDivider palette={palette} /><SettingRow icon="save" label="Auto-save" value={appState.autoSave} onValueChange={(value) => changeSetting('autoSave', value)} palette={palette} feather /><SettingDivider palette={palette} /><SettingRow icon="flag" label="Stop counting at target" value={appState.stopAtTarget} onValueChange={(value) => changeSetting('stopAtTarget', value)} palette={palette} feather /></SettingsSection><SettingsSection title="APPEARANCE" palette={palette}><View style={styles.themeRow}><View style={[styles.settingIcon, { backgroundColor: palette.primary }]}><Feather name="sun" size={17} color={palette.primaryForeground} /></View><Text style={[styles.settingLabel, { color: palette.foreground }]}>Theme</Text><View style={[styles.segmented, { backgroundColor: palette.surface }]}>{(['dark', 'light'] as const).map((theme) => <Pressable key={theme} onPress={() => changeSetting('theme', theme)} style={[styles.segment, appState.theme === theme && { backgroundColor: palette.primary }]}><Feather name={theme === 'dark' ? 'moon' : 'sun'} size={14} color={appState.theme === theme ? palette.primaryForeground : palette.muted} /><Text style={[styles.segmentText, { color: appState.theme === theme ? palette.primaryForeground : palette.muted }]}>{theme === 'dark' ? 'Dark' : 'Light'}</Text></Pressable>)}</View></View><SettingDivider palette={palette} /><View style={styles.settingInfoRow}><View style={[styles.settingIcon, { backgroundColor: palette.primary }]}><Feather name="type" size={17} color={palette.primaryForeground} /></View><View><Text style={[styles.settingLabel, { color: palette.foreground }]}>Counter size</Text><Text style={[styles.settingHint, { color: palette.muted }]}>Large and easy to read</Text></View></View></SettingsSection><SettingsSection title="ABOUT" palette={palette}><View style={styles.aboutRow}><View style={[styles.aboutMark, { backgroundColor: palette.primary }]}><MaterialCommunityIcons name="counter" size={21} color={palette.primaryForeground} /></View><View style={styles.aboutCopy}><Text style={[styles.aboutTitle, { color: palette.foreground }]}>Tasbeeh Counter</Text><Text style={[styles.aboutBody, { color: palette.muted }]}>A quiet place to remember.</Text></View><Text style={[styles.version, { color: palette.muted }]}>v1.0</Text></View></SettingsSection></ScrollView></View></Modal>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}><View style={styles.menuRoot}><Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)} /><View style={[styles.menuCard, { backgroundColor: palette.card, borderColor: palette.border, marginTop: insets.top + 70 }]}><View style={styles.menuBrandRow}><View style={[styles.menuMark, { backgroundColor: palette.primary }]}><MaterialCommunityIcons name="counter" size={20} color={palette.primaryForeground} /></View><View><Text style={[styles.menuTitle, { color: palette.foreground }]}>Tasbeeh Counter</Text><Text style={[styles.menuSubtitle, { color: palette.muted }]}>A mindful moment, one tap at a time</Text></View></View><Pressable accessibilityRole="button" accessibilityLabel="Open settings from menu" onPress={() => { setMenuOpen(false); setSettingsOpen(true); }} style={({ pressed: p }) => [styles.menuAction, { backgroundColor: palette.surface, opacity: p ? 0.75 : 1 }]}><Feather name="settings" size={18} color={palette.primaryBright} /><Text style={[styles.menuActionText, { color: palette.foreground }]}>Settings</Text><Feather name="chevron-right" size={17} color={palette.muted} /></Pressable></View></View></Modal>

      <Modal visible={resetting} transparent animationType="fade" onRequestClose={() => setResetting(false)}><View style={styles.confirmRoot}><Pressable style={styles.modalBackdrop} onPress={() => setResetting(false)} /><View style={[styles.confirmCard, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={[styles.confirmIcon, { backgroundColor: palette.primary }]}><Feather name="rotate-ccw" size={22} color={palette.primaryForeground} /></View><Text style={[styles.confirmTitle, { color: palette.foreground }]}>Reset Counter?</Text><Text style={[styles.confirmBody, { color: palette.muted }]}>This will reset the {selectedDhikr.name} count to 0.</Text><View style={styles.confirmActions}><Pressable accessibilityRole="button" accessibilityLabel="Cancel reset" onPress={() => setResetting(false)} style={[styles.confirmButton, { backgroundColor: palette.surface }]}><Text style={[styles.confirmButtonText, { color: palette.foreground }]}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Confirm reset" onPress={resetCurrent} style={[styles.confirmButton, { backgroundColor: palette.primary }]}><Text style={[styles.confirmButtonText, { color: palette.primaryForeground }]}>Reset</Text></Pressable></View></View></View></Modal>
    </LinearGradient>
  );
}

function HardwareCounter({ count, width, palette, scale, pressed, completionFlash, disabled, onPress, onPressIn, onPressOut }: { count: number; width: number; palette: Palette; scale: Animated.Value; pressed: boolean; completionFlash: boolean; disabled: boolean; onPress: () => void; onPressIn: () => void; onPressOut: () => void }) {
  const display = String(count).padStart(3, '0');
  return <View style={[styles.hardware, styles.hardwarePremium, { width, height: width * 1.38, shadowColor: completionFlash ? palette.primaryBright : palette.shadow, shadowOpacity: completionFlash ? 0.72 : 0.52, shadowRadius: completionFlash ? 34 : 26 }]}>
    <Image source={require('../assets/images/realistic-counter-polished.png')} resizeMode="contain" style={styles.hardwareImage} />
    <View pointerEvents="none" style={styles.lcdGlass} />
    <View style={styles.liveDisplay}>
      <Text style={styles.ghostDigits}>888</Text>
      <Animated.Text style={[styles.hardwareDigits, { transform: [{ scale }] }]}>{display}</Animated.Text>
    </View>
    <View pointerEvents="none" style={[styles.dialSurface, pressed && styles.dialSurfacePressed]} />
    <Pressable testID="tasbeeh-button" accessibilityRole="button" accessibilityLabel="Increment count" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={[styles.dialHitArea, pressed && styles.dialPressed]} />
  </View>;
}

function MetricCard({ icon, label, value, palette }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: number; palette: Palette }) { return <View style={[styles.metricCard, styles.premiumMetricCard, { backgroundColor: palette.card, borderColor: palette.border }]}><MaterialCommunityIcons name={icon} size={19} color={palette.primaryBright} /><Text style={[styles.metricLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.metricValue, styles.premiumMetricValue, { color: palette.foreground }]}>{value.toLocaleString()}</Text><View style={[styles.metricUnderline, { backgroundColor: palette.primary }]} /></View>; }

function formatHistoryDate(date?: string) {
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return date;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
}

function lifetimeTotalForDhikr(appState: AppState, id: string) {
  const dailyEntries = appState.dailyCountsByDhikr[id];
  if (dailyEntries && Object.keys(dailyEntries).length > 0) {
    return Object.values(dailyEntries).reduce((sum, value) => sum + value, 0);
  }
  return appState.history.reduce((sum, entry) => entry.dhikrId === id ? sum + entry.repetitions : sum, 0);
}

function HistorySection({ appState, palette }: { appState: AppState; palette: Palette }) {
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const groups = groupHistoryEntries(appState.history, appState.dhikrs);
  const selectedGroup = groups.find((group) => group.key === selectedGroupKey);
  const sectionOrder = ['TODAY', 'YESTERDAY', 'EARLIER'];
  if (appState.history.length === 0) return <EmptyPanel icon="clock" title="No practice history yet" body="Your counting sessions will appear here." palette={palette} />;
  if (selectedGroup) {
    return <View>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to History overview" onPress={() => setSelectedGroupKey(null)} style={styles.historyBack}><Feather name="chevron-left" size={18} color={palette.primaryBright} /><Text style={[styles.historyBackText, { color: palette.primaryBright }]}>History overview</Text></Pressable>
      <View style={styles.historyDetailHeading}><Text style={[styles.historyDetailTitle, { color: palette.foreground }]}>{selectedGroup.dhikr}</Text><Text style={[styles.historyDetailSubtitle, { color: palette.muted }]}>Individual sessions kept separate</Text></View>
      {selectedGroup.entries.map((entry) => <View key={entry.id} style={[styles.historySessionRow, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={styles.historyCopy}><Text style={[styles.historySessionCount, { color: palette.foreground }]}>{entry.repetitions.toLocaleString()} repetitions</Text><Text style={[styles.historyTime, { color: palette.muted }]}>{entry.date ? `${formatHistoryDate(entry.date)}${entry.time ? ` • ${entry.time}` : ''}` : 'Previous session'}</Text></View></View>)}
    </View>;
  }
  return <View>{sectionOrder.map((section) => {
    const sectionGroups = groups.filter((group) => getHistoryDateSection(group.dateKey) === section);
    if (sectionGroups.length === 0) return null;
    return <View key={section} style={styles.historyDateSection}><Text style={[styles.historyDateLabel, { color: palette.primaryBright }]}>{section}</Text>{sectionGroups.map((group) => {
      const total = group.entries.reduce((sum, entry) => sum + entry.repetitions, 0);
      const latest = group.entries[0];
      const dateNote = section === 'EARLIER' && group.dateKey ? formatHistoryDate(group.dateKey) : undefined;
      const sessionNote = group.entries.length > 1
        ? `${group.entries.length} sessions • ${group.dateKey ? `Latest ${latest.time}` : 'Previous session'}`
        : group.dateKey ? latest.time : 'Previous session';
      return <Pressable key={group.key} accessibilityRole="button" accessibilityLabel={`View ${group.dhikr} sessions`} onPress={() => setSelectedGroupKey(group.key)} style={({ pressed }) => [styles.historyGroupRow, styles.premiumHistoryGroup, { backgroundColor: palette.card, borderColor: palette.border, opacity: pressed ? 0.78 : 1 }]}><View style={[styles.historyIcon, { backgroundColor: palette.primary }]}><MaterialCommunityIcons name="counter" size={18} color={palette.primaryForeground} /></View><View style={styles.historyGroupCopy}><Text style={[styles.historyName, { color: palette.foreground }]}>{group.dhikr}</Text><Text style={[styles.historySummary, { color: palette.primaryBright }]}>{total.toLocaleString()} repetitions</Text><Text style={[styles.historyLatest, { color: palette.muted }]}>{dateNote ? `${dateNote} • ` : ''}{sessionNote}</Text></View><Feather name="chevron-right" size={18} color={palette.muted} /></Pressable>;
    })}</View>;
  })}</View>;
}

function SecondaryTab({ tab, palette, appState, todayCount, weekCount, totalCount, onChooseDhikr, onAddDhikr, onEditDhikr, onDeleteDhikr }: { tab: Tab; palette: Palette; appState: AppState; todayCount: number; weekCount: number; totalCount: number; onChooseDhikr: (id: string) => void; onAddDhikr: () => void; onEditDhikr: (item: DhikrRecord) => void; onDeleteDhikr: (id: string) => void }) {
  const insets = useSafeAreaInsets();
  const title = tab === 'history' ? 'History' : tab === 'stats' ? 'Statistics' : 'Dhikr Library';
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.secondaryContent, { paddingTop: insets.top + 18, paddingBottom: 110 + Math.max(insets.bottom, 14) }]}>
    <View style={styles.secondaryHeader}><Text style={[styles.secondaryTitle, { color: palette.foreground }]}>{title}</Text><Text style={[styles.secondarySubtitle, { color: palette.muted }]}>{tab === 'history' ? 'Your recent remembrance sessions' : tab === 'stats' ? 'A quiet view of your progress' : 'Choose a remembrance to continue'}</Text></View>
    {tab === 'history' ? <HistorySection appState={appState} palette={palette} />
      : tab === 'stats' ? <View>
        <View style={styles.statsGrid}><MetricCard icon="calendar-today" label="Today" value={todayCount} palette={palette} /><MetricCard icon="calendar-week" label="This Week" value={weekCount} palette={palette} /><MetricCard icon="chart-bar" label="All Time" value={totalCount} palette={palette} /></View>
        <View style={[styles.byDhikrPanel, { backgroundColor: palette.card, borderColor: palette.border }]}><Text style={[styles.byDhikrTitle, { color: palette.foreground }]}>By Dhikr</Text>{appState.dhikrs.length === 0 ? <EmptyPanel icon="bookmark" title="No Dhikrs yet" body="Add a Dhikr to see lifetime totals by remembrance." palette={palette} /> : appState.dhikrs.map((item) => <View key={item.id} style={[styles.byDhikrRow, { borderBottomColor: palette.border }]}><Text style={[styles.byDhikrName, { color: palette.foreground }]} numberOfLines={1}>{item.name}</Text><Text style={[styles.byDhikrValue, { color: palette.primaryBright }]}>{lifetimeTotalForDhikr(appState, item.id).toLocaleString()}</Text></View>)}</View>
      </View>
      : <View>
        <Pressable testID="add-dhikr" accessibilityRole="button" accessibilityLabel="Add Dhikr" onPress={onAddDhikr} style={[styles.plusButton, styles.premiumPrimaryButton, { backgroundColor: palette.primary, borderColor: palette.primaryBright, width: 160, height: 48, marginBottom: 14 }]}><Feather name="plus" size={18} color={palette.primaryForeground} /><Text style={[styles.plusText, { color: palette.primaryForeground, fontSize: 15 }]}>Add Dhikr</Text></Pressable>
        {appState.dhikrs.length === 0 ? <EmptyPanel icon="bookmark" title="Your library is empty" body="Add a Dhikr to begin counting." palette={palette} /> : appState.dhikrs.map((item) => <View key={item.id} testID={`dhikr-row-${item.id}`} style={[styles.libraryRow, styles.premiumLibraryRow, { backgroundColor: palette.card, borderColor: palette.border }]}><Pressable accessibilityRole="button" accessibilityLabel={`Select ${item.name}`} onPress={() => onChooseDhikr(item.id)} style={styles.librarySelect}><View style={[styles.historyIcon, { backgroundColor: palette.primary }]}><MaterialCommunityIcons name={item.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color={palette.primaryForeground} /></View><View style={styles.historyCopy}><Text style={[styles.historyName, { color: palette.foreground }]}>{item.name}</Text>{appState.targets[item.id] ? <Text style={[styles.libraryTarget, { color: palette.muted }]}>Target {appState.targets[item.id]}</Text> : null}<Text style={[styles.libraryLifetime, { color: palette.muted }]}>{lifetimeTotalForDhikr(appState, item.id).toLocaleString()} total</Text></View></Pressable><View style={styles.libraryMeta}><Text style={[styles.historyCount, { color: palette.primaryBright }]}>{String(appState.counters[item.id] ?? 0).padStart(3, '0')}</Text><View style={styles.libraryActions}><Pressable testID={`edit-dhikr-${item.id}`} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} onPress={() => onEditDhikr(item)} style={[styles.libraryAction, { backgroundColor: palette.surface }]}><Feather name="edit-3" size={17} color={palette.primaryBright} /></Pressable><Pressable testID={`delete-dhikr-${item.id}`} accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`} onPress={() => onDeleteDhikr(item.id)} style={[styles.libraryAction, { backgroundColor: palette.surface }]}><Feather name="trash-2" size={17} color={palette.destructive} /></Pressable></View></View></View>)}
      </View>}
  </ScrollView>;
}

function EmptyHome({ palette, onAdd, onSettings }: { palette: Palette; onAdd: () => void; onSettings: () => void }) { const insets = useSafeAreaInsets(); return <View style={{ flex: 1, paddingTop: insets.top + 24, paddingHorizontal: 21, paddingBottom: 100 + Math.max(insets.bottom, 14) }}><View style={styles.topBar}><View style={styles.iconButton} /><Text style={[styles.greetingName, { color: palette.foreground }]}>Tasbeeh Counter</Text><IconButton icon="settings" label="Open settings" onPress={onSettings} palette={palette} /></View><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}><MaterialCommunityIcons name="counter" size={48} color={palette.primaryBright} /><Text style={[styles.emptyTitle, { color: palette.foreground }]}>Start your library</Text><Text style={[styles.emptyBody, { color: palette.muted }]}>Add a Dhikr to begin your local practice.</Text><Pressable testID="empty-add-dhikr" accessibilityRole="button" accessibilityLabel="Add Dhikr" onPress={onAdd} style={[styles.plusButton, styles.premiumPrimaryButton, { backgroundColor: palette.primary, borderColor: palette.primaryBright, width: 160, height: 48, marginTop: 18 }]}><Feather name="plus" size={18} color={palette.primaryForeground} /><Text style={[styles.plusText, { color: palette.primaryForeground, fontSize: 15 }]}>Add Dhikr</Text></Pressable></View></View>; }
function EmptyPanel({ icon, title, body, palette }: { icon: keyof typeof Feather.glyphMap; title: string; body: string; palette: Palette }) { return <View style={[styles.emptyPanel, styles.premiumEmptyPanel, { backgroundColor: palette.card, borderColor: palette.border }]}><Feather name={icon} size={25} color={palette.primaryBright} /><Text style={[styles.emptyTitle, { color: palette.foreground }]}>{title}</Text><Text style={[styles.emptyBody, { color: palette.muted }]}>{body}</Text></View>; }
function TabBar({ activeTab, palette, onChange, bottomInset }: { activeTab: Tab; palette: Palette; onChange: (tab: Tab) => void; bottomInset: number }) { const items: Array<{ id: Tab; label: string; icon: keyof typeof Feather.glyphMap }> = [{ id: 'counter', label: 'Counter', icon: 'smartphone' }, { id: 'history', label: 'History', icon: 'list' }, { id: 'stats', label: 'Stats', icon: 'bar-chart-2' }, { id: 'dhikrs', label: 'Dhikrs', icon: 'bookmark' }]; return <View style={[styles.tabBar, styles.premiumTabBar, { backgroundColor: palette.background, borderTopColor: palette.border, paddingBottom: Math.max(bottomInset, 9) }]}>{items.map((item) => { const active = activeTab === item.id; return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Open ' + item.label} onPress={() => onChange(item.id)} style={({ pressed: p }) => [styles.tabItem, p && styles.pressed]}><View style={styles.tabIconWrap}><Feather name={item.icon} size={21} color={active ? palette.primaryBright : palette.muted} />{active ? <View style={[styles.tabActiveIndicator, { backgroundColor: palette.primaryBright }]} /> : null}</View><Text style={[styles.tabLabel, { color: active ? palette.primaryBright : palette.muted }]}>{item.label}</Text></Pressable>; })}</View>; }
function IconButton({ icon, label, onPress, palette }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; palette: Palette }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed: p }) => [styles.iconButton, { opacity: p ? 0.66 : 1 }]}><Feather name={icon} size={25} color={palette.foreground} /></Pressable>; }
function SettingRow({ icon, label, value, onValueChange, palette, feather = false }: { icon: string; label: string; value: boolean; onValueChange: (value: boolean) => void; palette: Palette; feather?: boolean }) { return <View style={styles.settingRow}><View style={[styles.settingIcon, { backgroundColor: palette.primary }]}>{feather ? <Feather name={icon as keyof typeof Feather.glyphMap} size={17} color={palette.primaryForeground} /> : <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color={palette.primaryForeground} />}</View><Text style={[styles.settingLabel, { color: palette.foreground }]}>{label}</Text><Switch testID={'toggle-' + label.toLowerCase().replace(' ', '-')} accessibilityLabel={'Toggle ' + label} value={value} onValueChange={onValueChange} trackColor={{ false: palette.surfaceStrong, true: palette.greenSoft }} thumbColor={value ? palette.primaryBright : palette.muted} ios_backgroundColor={palette.surfaceStrong} /></View>; }
function SettingDivider({ palette }: { palette: Palette }) { return <View style={[styles.settingDivider, { backgroundColor: palette.border }]} />; }
function SettingsSection({ title, children, palette }: { title: string; children: React.ReactNode; palette: Palette }) { return <View style={styles.settingsSection}><Text style={[styles.sectionLabel, { color: palette.primaryBright }]}>{title}</Text><View style={[styles.settingsGroup, styles.premiumSettingsGroup, { backgroundColor: palette.card, borderColor: palette.border }]}>{children}</View></View>; }
function SheetHandle({ palette }: { palette: Palette }) { return <View style={[styles.sheetHandle, { backgroundColor: palette.surfaceStrong }]} />; }

const styles = StyleSheet.create({
  root: { flex: 1 }, scrollContent: { paddingHorizontal: 21 }, topBar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, greeting: { alignItems: 'center', gap: 1 }, eyebrow: { fontFamily: 'Inter_400Regular', fontSize: 13 }, greetingName: { fontFamily: 'Inter_700Bold', fontSize: 21 }, sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 9 }, selector: { minHeight: 72, borderRadius: 31, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', position: 'relative', marginTop: 5, marginBottom: 13, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 6 }, selectorMain: { flex: 1, minHeight: 62, flexDirection: 'row', alignItems: 'center' }, selectorIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, selectorCopy: { flex: 1, paddingLeft: 12 }, selectorName: { fontFamily: 'Inter_600SemiBold', fontSize: 16 }, arabic: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }, targetPill: { minHeight: 31, minWidth: 80, borderRadius: 16, paddingHorizontal: 9, marginLeft: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, targetPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 }, selectorProgressTrack: { position: 'absolute', left: 64, right: 13, bottom: 5, height: 3, borderRadius: 2, overflow: 'hidden' }, selectorProgress: { height: '100%', borderRadius: 2 }, hardware: { borderRadius: 74, overflow: 'hidden', alignSelf: 'center', position: 'relative', shadowOpacity: 0.52, shadowRadius: 26, shadowOffset: { width: 0, height: 18 }, elevation: 15 }, hardwareImage: { position: 'absolute', width: '100%', height: '100%', left: 0, top: 0 }, liveDisplay: { position: 'absolute', left: '18%', top: '13%', width: '59%', height: '20%', alignItems: 'flex-end', justifyContent: 'center', paddingRight: 10, overflow: 'hidden' }, ghostDigits: { position: 'absolute', right: 8, top: 5, fontFamily: 'monospace', fontSize: 55, letterSpacing: 1, color: '#AAB2A8', opacity: 0.19 }, hardwareDigits: { color: '#060807', fontFamily: 'monospace', fontSize: 57, fontWeight: '800', letterSpacing: -2 }, deviceLabels: { position: 'absolute', top: '35%', left: '18%', right: '18%', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 }, deviceLabel: { color: '#ECEAE7', fontFamily: 'Inter_500Medium', fontSize: 16, letterSpacing: 0.2 }, dialHitArea: { position: 'absolute', left: '14%', top: '61%', width: '72%', height: '38%', borderRadius: 1000 }, dialPressed: { transform: [{ scale: 0.95 }, { translateY: 5 }] }, metricsRow: { flexDirection: 'row', gap: 9, marginTop: 12 }, metricCard: { flex: 1, minHeight: 88, borderRadius: 17, borderWidth: 1, padding: 12, justifyContent: 'space-between' }, metricLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }, metricValue: { fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 4 }, metricUnderline: { width: 28, height: 2, marginTop: 4 }, goalCard: { minHeight: 62, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 9 }, goalIcon: { width: 33, height: 33, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }, goalCopy: { width: 80 }, goalLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 }, goalValue: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }, goalProgressWrap: { flex: 1 }, goalTrack: { height: 7, borderRadius: 4, overflow: 'hidden' }, goalProgress: { height: '100%', borderRadius: 4 }, goalPercent: { fontFamily: 'Inter_500Medium', fontSize: 12 }, actionBar: { minHeight: 69, borderRadius: 35, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 }, actionItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 7, minHeight: 44 }, actionDivider: { width: 1, height: 35 }, actionText: { fontFamily: 'Inter_500Medium', fontSize: 12 }, plusButton: { width: 168, height: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 7 }, elevation: 8 }, plusText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 25 }, pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] }, offlineNote: { fontFamily: 'Inter_400Regular', fontSize: 11, textAlign: 'center', marginTop: 14 }, tabBar: { position: 'absolute', bottom: 0, left: 0, right: 0, minHeight: 74, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 8 }, tabItem: { alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 62 }, tabLabel: { fontFamily: 'Inter_500Medium', fontSize: 11 }, secondaryContent: { paddingHorizontal: 21 }, secondaryHeader: { marginBottom: 18 }, secondaryTitle: { fontFamily: 'Inter_700Bold', fontSize: 28 }, secondarySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 6 }, historyRow: { minHeight: 68, borderRadius: 17, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 9 }, historyIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, historyCopy: { flex: 1, paddingLeft: 11 }, historyName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 }, historyTime: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, historyCount: { fontFamily: 'Inter_700Bold', fontSize: 16 }, libraryRow: { minHeight: 68, borderRadius: 17, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 9 }, libraryMeta: { alignItems: 'flex-end', gap: 3 }, libraryTarget: { fontFamily: 'Inter_400Regular', fontSize: 10 }, statsGrid: { flexDirection: 'row', gap: 10 }, longPanel: { borderRadius: 20, borderWidth: 1, padding: 20, marginTop: 12 }, panelEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2 }, panelTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: 14 }, panelBody: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 6 }, emptyPanel: { minHeight: 190, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 25 }, emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 13 }, emptyBody: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 7, maxWidth: 250 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' }, modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.72)' }, sheet: { borderTopLeftRadius: 31, borderTopRightRadius: 31, borderWidth: 1, padding: 20, paddingTop: 12 }, dhikrFormSheet: { maxHeight: '92%' }, dhikrFormContent: { gap: 10, paddingBottom: 4 }, formSubmit: { minHeight: 49, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 19 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, sheetTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 }, sheetSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }, closeButton: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, option: { minHeight: 62, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginTop: 9 }, optionIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, optionCopy: { flex: 1, paddingLeft: 11 }, optionName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 }, optionArabic: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, optionMeta: { alignItems: 'flex-end', gap: 5, paddingLeft: 8 }, optionCount: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 1 }, optionNumber: { fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 1 }, targetPresetRow: { flexDirection: 'row', gap: 8 }, targetPreset: { flex: 1, minHeight: 48, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }, targetPresetText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 }, customTargetRow: { flexDirection: 'row', gap: 9, marginTop: 12 }, customTargetInput: { flex: 1, minHeight: 49, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, fontFamily: 'Inter_500Medium', fontSize: 15 }, customTargetSave: { width: 80, minHeight: 49, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, targetHint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, marginTop: 14 }, settingsRoot: { flex: 1, paddingHorizontal: 20 }, settingsHeader: { minHeight: 73, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, settingsScroll: { paddingTop: 14, paddingBottom: 30 }, settingsSection: { marginBottom: 22 }, settingsGroup: { borderRadius: 23, borderWidth: 1, paddingHorizontal: 15 }, settingDivider: { height: 1, marginLeft: 48 }, settingRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, settingLabel: { fontFamily: 'Inter_500Medium', fontSize: 15, flex: 1 }, themeRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12 }, segmented: { flexDirection: 'row', borderRadius: 13, padding: 3, gap: 2 }, segment: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10 }, segmentText: { fontFamily: 'Inter_500Medium', fontSize: 11 }, settingInfoRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingHint: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, aboutRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center' }, aboutMark: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, aboutCopy: { flex: 1, paddingLeft: 12 }, aboutTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 }, aboutBody: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }, version: { fontFamily: 'Inter_500Medium', fontSize: 11 }, menuRoot: { flex: 1 }, menuCard: { marginHorizontal: 16, borderRadius: 24, borderWidth: 1, padding: 14, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 }, menuBrandRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 13 }, menuMark: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 11 }, menuTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 }, menuSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }, menuAction: { minHeight: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12 }, menuActionText: { fontFamily: 'Inter_500Medium', fontSize: 14, flex: 1 }, confirmRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 }, confirmCard: { width: '100%', borderRadius: 27, borderWidth: 1, padding: 22, alignItems: 'center' }, confirmIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 15 }, confirmTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 }, confirmBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 250 }, confirmActions: { width: '100%', flexDirection: 'row', gap: 9, marginTop: 22 }, confirmButton: { flex: 1, minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, confirmButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  librarySelect: { flex: 1, minHeight: 62, flexDirection: 'row', alignItems: 'center' }, libraryActions: { flexDirection: 'row', gap: 8 }, libraryAction: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, byDhikrPanel: { borderRadius: 20, borderWidth: 1, padding: 18, marginTop: 14 }, byDhikrTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 6 }, byDhikrRow: { minHeight: 49, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' }, byDhikrName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, paddingRight: 12 }, byDhikrValue: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  historyDateSection: { marginBottom: 18 }, historyDateLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 9 }, historyGroupRow: { minHeight: 78, borderRadius: 17, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 9 }, historyGroupCopy: { flex: 1, paddingLeft: 11, paddingRight: 9 }, historySummary: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 4 }, historyLatest: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, historyBack: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }, historyBackText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 }, historyDetailHeading: { marginBottom: 14 }, historyDetailTitle: { fontFamily: 'Inter_700Bold', fontSize: 21 }, historyDetailSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }, historySessionRow: { minHeight: 63, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center', marginBottom: 9 }, historySessionCount: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  premiumSelector: { shadowOpacity: 0.28, shadowRadius: 19, shadowOffset: { width: 0, height: 9 }, elevation: 8 }, premiumActionBar: { shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 }, premiumPrimaryButton: { borderWidth: 1, shadowOpacity: 0.32, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 7 }, hardwarePremium: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }, lcdGlass: { position: 'absolute', left: '17.5%', top: '12.5%', width: '60%', height: '21%', borderRadius: 12, backgroundColor: 'rgba(205,214,198,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, dialSurface: { position: 'absolute', left: '14%', top: '61%', width: '72%', height: '38%', borderRadius: 1000, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.015)' }, dialSurfacePressed: { transform: [{ scale: 0.96 }, { translateY: 5 }], backgroundColor: 'rgba(0,0,0,0.08)' }, premiumLibraryRow: { shadowOpacity: 0.16, shadowRadius: 13, shadowOffset: { width: 0, height: 6 }, elevation: 4 }, libraryLifetime: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }, premiumMetricCard: { minHeight: 104, borderRadius: 20, padding: 14, shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 }, premiumMetricValue: { fontSize: 23, letterSpacing: -0.5 }, premiumHistoryGroup: { borderRadius: 20, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 }, premiumEmptyPanel: { shadowOpacity: 0.13, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 4 }, premiumSettingsGroup: { shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 4 }, premiumTabBar: { shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: -5 }, elevation: 10 }, tabIconWrap: { minHeight: 28, alignItems: 'center', justifyContent: 'center' }, tabActiveIndicator: { position: 'absolute', bottom: -8, width: 18, height: 2, borderRadius: 2 },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState as NativeAppState, Animated, BackHandler, Easing, Image, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';
import { calculateStats, canAcceptCount, canContinueHistorySession, createLatestStatePersister, getCountFeedback, getLcdFontSize, getLocalDateKey, restoreStoredState, type AccentTheme, type AppState, type DhikrRecord } from '@/lib/counterLogic';
import { getHistoryDateSection, groupHistoryEntries } from '@/lib/historyLogic';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

type Dhikr = DhikrRecord & { icon: keyof typeof MaterialCommunityIcons.glyphMap };
const STORAGE_KEY = 'tasbeeh-counter-state-v1';
const COUNTER_IMAGE = require('../assets/images/realistic-counter-polished.png');
const COUNTER_IMAGES: Record<AccentTheme, number> = {
  red: COUNTER_IMAGE,
  green: require('../assets/images/realistic-counter-green.png'),
  blue: require('../assets/images/realistic-counter-blue.png'),
  sandalwood: require('../assets/images/realistic-counter-sandalwood.png'),
  'arabesque-white': require('../assets/images/realistic-counter-arabesque-white-aligned.png'),
};
const CINEMATIC_BACKGROUND = require('../assets/images/tasbeeh-cinematic-background.png');
const ARABESQUE_BACKGROUND = require('../assets/images/arabesque-white-background.png');
const LEGACY_DHIKRS: Dhikr[] = [
  { id: 'subhanallah', name: 'SubhanAllah', arabic: 'سُبْحَانَ ٱللَّٰهِ', icon: 'circle-double' },
  { id: 'alhamdulillah', name: 'Alhamdulillah', arabic: 'ٱلْحَمْدُ لِلَّٰهِ', icon: 'flower-tulip' },
  { id: 'allahu-akbar', name: 'Allahu Akbar', arabic: 'ٱللَّٰهُ أَكْبَرُ', icon: 'star-four-points' },
  { id: 'la-ilaha', name: 'La ilaha illallah', arabic: 'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ', icon: 'infinity' },
  { id: 'astaghfirullah', name: 'Astaghfirullah', arabic: 'أَسْتَغْفِرُ ٱللَّٰهَ', icon: 'water-outline' },
  { id: 'subhanallahi', name: 'SubhanAllahi wa bihamdihi', arabic: 'سُبْحَانَ ٱللَّٰهِ وَبِحَمْدِهِ', icon: 'weather-sunny' },
];
const ANONYMOUS_DHIKR_ID = '__tasbeeh__';
const ANONYMOUS_DHIKR_NAME = 'Tasbeeh';
const DEFAULT_STATE: AppState = { dhikrs: [], selectedId: '', anonymousCount: 0, counters: {}, targets: {}, dailyCounts: {}, dailyCountsByDhikr: {}, lifetimeCount: 0, lifetimeCountsByDhikr: {}, vibration: true, sound: true, counterAnimation: true, autoSave: true, stopAtTarget: false, theme: 'dark', accentTheme: 'red', history: [] };
type Palette = { [Key in keyof typeof colors.dark]: string };

type Tab = 'counter' | 'history' | 'stats' | 'dhikrs';

function ModalKeyboardAvoidingView({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web') {
    return <View style={{ flex: 1, justifyContent: 'flex-end' }}>{children}</View>;
  }
  return <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} automaticOffset style={{ flex: 1, justifyContent: 'flex-end' }}>{children}</KeyboardAvoidingView>;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const counterSafeTop = Platform.OS === 'ios' ? Math.max(insets.top, 60) : Platform.OS === 'android' ? Math.max(insets.top, 30) : Math.max(insets.top, 18);
  const compactCounter = height < 800;
  const [appState, setAppState] = useState<AppState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [counterAssetsReady, setCounterAssetsReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('counter');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [dhikrEditorOpen, setDhikrEditorOpen] = useState(false);
  const [editingDhikrId, setEditingDhikrId] = useState<string | null>(null);
  const [dhikrNameDraft, setDhikrNameDraft] = useState('');
  const [dhikrTargetDraft, setDhikrTargetDraft] = useState('');
  const [dhikrCustomTargetOpen, setDhikrCustomTargetOpen] = useState(false);
  const [deleteDhikrId, setDeleteDhikrId] = useState<string | null>(null);
  const [completionFlash, setCompletionFlash] = useState(false);
  const [historyGroupKey, setHistoryGroupKey] = useState<string | null>(null);
  const appStateRef = useRef<AppState>(DEFAULT_STATE);
  const scale = useRef(new Animated.Value(1)).current;
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const tapSound = useAudioPlayer(require('../assets/sounds/tap.wav'));
  const completionSound = useAudioPlayer(require('../assets/sounds/completion.wav'));
  const webAudio = useRef<AudioContext | null>(null);
  const storagePersister = useRef(createLatestStatePersister<AppState>((state) => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)))).current;
  const feedbackTriggered = useRef(new Set<string>());
  const activeHistorySessionId = useRef<string | null>(null);
  const isSandalwood = appState.accentTheme === 'sandalwood';
  const isArabesqueWhite = appState.accentTheme === 'arabesque-white';
  const basePalette = isSandalwood
    ? (appState.theme === 'light' ? colors.sandalwood.light : colors.sandalwood.dark)
    : isArabesqueWhite
      ? (appState.theme === 'light' ? colors.arabesqueWhite.light : colors.arabesqueWhite.dark)
      : (appState.theme === 'light' ? colors.light : colors.dark);
  const palette: Palette = { ...basePalette, ...(isSandalwood || isArabesqueWhite ? {} : colors.accents[appState.accentTheme]) };
  const selectedDhikr = useMemo(() => appState.dhikrs.find((item) => item.id === appState.selectedId) ?? appState.dhikrs[0] ?? ({ id: ANONYMOUS_DHIKR_ID, name: ANONYMOUS_DHIKR_NAME, arabic: '', icon: 'circle-double' } as Dhikr), [appState.dhikrs, appState.selectedId]);
  const anonymousCounter = selectedDhikr.id === ANONYMOUS_DHIKR_ID;
  const currentCount = anonymousCounter ? appState.anonymousCount : appState.counters[selectedDhikr.id] ?? 0;
  const selectedTarget = anonymousCounter ? null : appState.targets[selectedDhikr.id] ?? null;
  const stats = calculateStats(appState.dailyCounts, appState.lifetimeCount, new Date(), appState.dailyCountsByDhikr);
  const todayCount = stats.today;
  const weekCount = stats.thisWeek;
  const totalCount = stats.total;
  const deviceWidth = compactCounter ? Math.min(Math.max(width - 112, 240), 250) : Math.min(Math.max(width - 112, 240), 330);
  const targetProgress = selectedTarget ? Math.min(currentCount / selectedTarget, 1) : 0;
  const animatedProgressWidth = progressAnimation.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const updateAppState = (updater: (previous: AppState) => AppState) => {
    const next = updater(appStateRef.current);
    appStateRef.current = next;
    setAppState(next);
    if (hydrated) void queuePersist(next);
    return next;
  };

  const queuePersist = (state: AppState) => {
    return storagePersister.enqueue(state);
  };

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (active) {
          const migrated = restoreStoredState(raw ? JSON.parse(raw) as unknown : null, DEFAULT_STATE, LEGACY_DHIKRS);
          appStateRef.current = migrated;
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
    const persistWhenInactive = (nextState: string) => {
      if (hydrated && (nextState === 'background' || nextState === 'inactive')) void queuePersist(appStateRef.current);
    };
    const subscription = NativeAppState.addEventListener('change', persistWhenInactive);
    return () => {
      subscription.remove();
      if (hydrated) void queuePersist(appStateRef.current);
    };
  }, [hydrated]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectorOpen || settingsOpen || resetting || dhikrEditorOpen || deleteDhikrId !== null) return false;
      if (activeTab === 'history' && historyGroupKey !== null) {
        setHistoryGroupKey(null);
        return true;
      }
      if (activeTab !== 'counter') {
        setActiveTab('counter');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [activeTab, deleteDhikrId, dhikrEditorOpen, historyGroupKey, resetting, selectorOpen, settingsOpen]);

  useEffect(() => {
    tapSound.volume = 0.42;
    completionSound.volume = 0.55;
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {
      // The web oscillator below remains a graceful fallback.
    });
  }, [completionSound, tapSound]);

  useEffect(() => {
    let active = true;
    const preloadCounterAssets = async () => {
      const uris = [...Object.values(COUNTER_IMAGES), CINEMATIC_BACKGROUND, ARABESQUE_BACKGROUND]
        .map((source) => {
          try {
            return Image.resolveAssetSource(source)?.uri;
          } catch {
            return null;
          }
        })
        .filter((uri): uri is string => Boolean(uri));
      await Promise.all(uris.map((uri) => Image.prefetch(uri).catch(() => false)));
      if (active) setCounterAssetsReady(true);
    };
    void preloadCounterAssets();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    Animated.timing(progressAnimation, {
      toValue: targetProgress,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progressAnimation, targetProgress]);

  const playClick = async () => {
    if (tapSound.isLoaded) {
      try { await tapSound.seekTo(0); tapSound.play(); return; } catch { /* use web oscillator */ }
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
    if (completionSound.isLoaded) {
      try { await completionSound.seekTo(0); completionSound.play(); return; } catch { /* use web oscillator */ }
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
    const dhikrId = dhikr?.id ?? ANONYMOUS_DHIKR_ID;
    const dhikrName = dhikr?.name ?? ANONYMOUS_DHIKR_NAME;
    const count = dhikr ? previous.counters[dhikr.id] ?? 0 : previous.anonymousCount;
    const target = dhikr ? previous.targets[dhikr.id] ?? null : null;
    if (!canAcceptCount(count, target, previous.stopAtTarget, hydrated)) {
      if (previous.vibration) void Haptics.selectionAsync();
      return;
    }
    const nextCount = Math.min(999999, count + 1);
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const date = getLocalDateKey();
    const targetFeedbackKey = `target:${dhikrId}:${target}`;
    const feedback = getCountFeedback(nextCount, target);
    const reachedTarget = feedback === 'target' && !feedbackTriggered.current.has(targetFeedbackKey);
    const milestone = feedback === 'milestone';
    const milestoneFeedbackKey = `milestone:${dhikrId}:${nextCount}`;
    const last = previous.history[0];
    const canContinueSession = dhikr
      ? canContinueHistorySession(activeHistorySessionId.current, last, dhikr.id, date)
      : Boolean(activeHistorySessionId.current && last?.id === activeHistorySessionId.current && last.dhikrId === ANONYMOUS_DHIKR_ID && last.date === date);
    const sessionId = canContinueSession ? last!.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextHistory = canContinueSession
      ? [{ ...last, repetitions: last.repetitions + 1, time, date }, ...previous.history.slice(1)]
      : [{ id: sessionId, dhikr: dhikrName, dhikrId, repetitions: 1, time, date }, ...previous.history];
    activeHistorySessionId.current = sessionId;
    updateAppState(() => ({
      ...previous,
      anonymousCount: dhikr ? previous.anonymousCount : nextCount,
      counters: dhikr ? { ...previous.counters, [dhikr.id]: nextCount } : previous.counters,
      dailyCounts: { ...previous.dailyCounts, [date]: (previous.dailyCounts[date] ?? 0) + 1 },
      dailyCountsByDhikr: dhikr ? {
        ...previous.dailyCountsByDhikr,
        [dhikr.id]: { ...(previous.dailyCountsByDhikr[dhikr.id] ?? {}), [date]: (previous.dailyCountsByDhikr[dhikr.id]?.[date] ?? 0) + 1 },
      } : previous.dailyCountsByDhikr,
      lifetimeCount: previous.lifetimeCount + 1,
      lifetimeCountsByDhikr: dhikr ? {
        ...previous.lifetimeCountsByDhikr,
        [dhikr.id]: (previous.lifetimeCountsByDhikr[dhikr.id] ?? 0) + 1,
      } : previous.lifetimeCountsByDhikr,
      history: nextHistory,
    }));
    if (reachedTarget) {
      feedbackTriggered.current.add(targetFeedbackKey);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    if (anonymousCounter) {
      setResetting(false);
      activeHistorySessionId.current = null;
      setCompletionFlash(false);
      updateAppState((previous) => ({ ...previous, anonymousCount: 0 }));
      return;
    }
    const id = appStateRef.current.selectedId;
    setResetting(false);
    activeHistorySessionId.current = null;
    [...feedbackTriggered.current].filter((key) => key.includes(`:${id}:`)).forEach((key) => feedbackTriggered.current.delete(key));
    setCompletionFlash(false);
    updateAppState((previous) => ({ ...previous, counters: { ...previous.counters, [id]: 0 } }));
  };
  const chooseDhikr = (id: string) => { activeHistorySessionId.current = null; updateAppState((previous) => ({ ...previous, selectedId: id })); setSelectorOpen(false); setActiveTab('counter'); };
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
    activeHistorySessionId.current = null;
    updateAppState((previous) => {
      const dhikrs = previous.dhikrs.filter((item) => item.id !== id);
      const nextSelected = previous.selectedId === id ? dhikrs[0]?.id ?? '' : previous.selectedId;
      const counters = { ...previous.counters }; delete counters[id];
      const targets = { ...previous.targets }; delete targets[id];
      return { ...previous, dhikrs, selectedId: nextSelected, counters, targets };
    });
    setDeleteDhikrId(null);
  };

  return (
    <LinearGradient colors={isSandalwood || isArabesqueWhite ? [palette.background, palette.card, palette.background] : appState.theme === 'light' ? [palette.background, '#e9e4de', palette.background] : [palette.background, '#171211', palette.background]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.root}>
      <StatusBar barStyle={appState.theme === 'light' ? 'dark-content' : 'light-content'} />
      {activeTab === 'counter' ? <View style={[styles.counterScroll, { overflow: 'hidden', paddingHorizontal: 21, paddingTop: counterSafeTop + 8, paddingBottom: 80 + Math.max(insets.bottom, 14) }]}>
        <CounterAtmosphere dark={appState.theme !== 'light'} accent={palette.primaryBright} sandalwood={isSandalwood} arabesqueWhite={isArabesqueWhite} />
         <View style={[styles.counterLayer, { flex: 1, minHeight: 0 }]}>
           <View style={[styles.topBar, styles.referenceTopBar, compactCounter && styles.referenceTopBarCompact]}><View style={styles.counterHeaderCopy}><Text style={[styles.counterTitle, (isSandalwood || isArabesqueWhite) && { fontStyle: 'normal', fontWeight: '400' }, { color: palette.foreground, textShadowColor: palette.primary, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 10 }]}>Tasbeeh</Text>{isSandalwood || isArabesqueWhite ? <View style={[themeStyles.titleDivider, { backgroundColor: palette.primaryBright }]} /> : null}</View><IconButton icon="settings" label="Open settings" onPress={() => setSettingsOpen(true)} palette={palette} accent={isSandalwood || isArabesqueWhite} /></View>
           <View style={[styles.selector, styles.referenceSelector, compactCounter && styles.referenceSelectorCompact, styles.premiumSelector, { backgroundColor: isArabesqueWhite ? 'rgba(255, 253, 247, 0.9)' : isSandalwood ? 'rgba(42, 27, 19, 0.92)' : appState.theme === 'light' ? palette.card : 'rgba(30, 30, 30, 0.9)', borderColor: completionFlash ? palette.primaryBright : palette.border }]}>
           <Pressable testID="dhikr-selector" accessibilityRole="button" accessibilityLabel={'Select Dhikr, currently ' + selectedDhikr.name} disabled={anonymousCounter} onPress={() => setSelectorOpen(true)} style={({ pressed: selectorPressed }) => [styles.selectorMain, { opacity: selectorPressed ? 0.82 : 1 }]}>
              <DhikrMark palette={palette} size={compactCounter ? 48 : 54} />
              <View style={styles.selectorCopy}><Text style={[styles.selectorName, compactCounter && { fontSize: 14, lineHeight: 18 }, { color: isArabesqueWhite ? colors.arabesqueWhite.light.foreground : palette.foreground }]}>{selectedDhikr.name}</Text><Text style={[styles.arabic, compactCounter && { fontSize: 10 }, { color: isArabesqueWhite ? colors.arabesqueWhite.light.muted : palette.muted }]}>{selectedDhikr.arabic}</Text></View>
              {anonymousCounter ? null : <Feather name="chevron-down" size={20} color={isArabesqueWhite ? colors.arabesqueWhite.light.foreground : palette.foreground} />}
          </Pressable>
           {selectedTarget ? <View accessibilityLabel={`Target ${selectedTarget}`} style={[styles.targetPill, { backgroundColor: palette.primary }]}>
            <MaterialCommunityIcons name={completionFlash ? 'check-circle' : 'target'} size={14} color={selectedTarget ? palette.primaryForeground : palette.primaryBright} />
             <Text style={[styles.targetPillText, { color: palette.primaryForeground }]}>{`${currentCount} / ${selectedTarget}`}</Text>
           </View> : null}
           {selectedTarget ? <View style={[styles.selectorProgressTrack, { backgroundColor: palette.surfaceStrong }]}><Animated.View style={[styles.selectorProgress, { width: animatedProgressWidth, backgroundColor: completionFlash ? palette.primaryBright : palette.primary, shadowColor: palette.primaryBright }]} /></View> : null}
        </View>
             <View style={[styles.counterDeviceStage, compactCounter && styles.counterDeviceStageCompact, { flex: 1 }]}><View style={[styles.deviceContactShadow, pressed && { opacity: 0.18, transform: [{ scaleX: 0.78 }, { translateY: 2 }] }]} />{counterAssetsReady ? <HardwareCounter count={currentCount} width={deviceWidth} palette={palette} counterImage={COUNTER_IMAGES[appState.accentTheme]} counterTheme={appState.accentTheme} scale={scale} pressed={pressed} completionFlash={completionFlash} disabled={!hydrated} onPress={increment} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} /> : <View style={[styles.hardware, { width: deviceWidth, height: deviceWidth * 1.38, backgroundColor: palette.surfaceStrong, opacity: 0.35 }]} />}</View>
          <View style={[styles.counterQuote, compactCounter && styles.counterQuoteCompact, { marginBottom: 50 }]}><Text style={[styles.counterQuoteText, { color: palette.foreground }]}>“In the remembrance of Allah{'\n'}do hearts find peace.”</Text><View style={[styles.counterQuoteRule, { backgroundColor: palette.primaryBright }]} /><Text style={[styles.counterQuoteCitation, { color: palette.muted }]}>(Quran 13:28)</Text></View>
             <View pointerEvents="box-none" style={{ alignItems: 'flex-end', marginTop: compactCounter ? 0 : 3, paddingRight: 3, position: 'absolute', right: 0, bottom: 4, zIndex: 10, elevation: 10 }}><Pressable testID="reset-counter" accessibilityRole="button" accessibilityLabel={'Reset ' + selectedDhikr.name + ' counter'} hitSlop={10} onPressIn={() => { if (appStateRef.current.vibration) Haptics.selectionAsync().catch(() => undefined); }} onPress={() => setResetting(true)} style={({ pressed: p }) => [{ width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: isSandalwood || isArabesqueWhite ? palette.primary : palette.border, backgroundColor: 'rgba(18, 18, 18, 0.68)', alignItems: 'center', justifyContent: 'center', shadowColor: palette.primary, shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3, transform: [{ scale: p ? 0.9 : 1 }], opacity: p ? 0.78 : 1 }]}><Feather name="rotate-ccw" size={18} color={isSandalwood || isArabesqueWhite ? palette.destructive : palette.primaryBright} /></Pressable></View>
         </View>
             </View> : <SecondaryTab tab={activeTab} palette={palette} appState={appState} todayCount={todayCount} weekCount={weekCount} totalCount={totalCount} historyGroupKey={historyGroupKey} onHistoryGroupChange={setHistoryGroupKey} onChooseDhikr={chooseDhikr} onAddDhikr={() => openDhikrEditor()} onEditDhikr={openDhikrEditor} onDeleteDhikr={setDeleteDhikrId} />}
        <TabBar activeTab={activeTab} palette={palette} onChange={(tab) => { if (tab !== 'history') setHistoryGroupKey(null); setActiveTab(tab); }} bottomInset={insets.bottom} />

        <Modal visible={selectorOpen} transparent animationType="slide" onRequestClose={() => setSelectorOpen(false)}><View style={styles.modalRoot}><Pressable style={styles.modalBackdrop} onPress={() => setSelectorOpen(false)} /><View style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: Math.max(insets.bottom, 18) + 10 }]}><SheetHandle palette={palette} /><View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: palette.foreground }]}>Choose Dhikr</Text><Text style={[styles.sheetSubtitle, { color: palette.muted }]}>Each remembrance keeps its own count</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close Dhikr selector" onPress={() => setSelectorOpen(false)} style={[styles.closeButton, { backgroundColor: palette.surface }]}><Feather name="x" size={19} color={palette.foreground} /></Pressable></View>{appState.dhikrs.map((item, index) => { const active = item.id === selectedDhikr?.id; return <Pressable key={item.id} testID={'dhikr-option-' + item.id} accessibilityRole="button" accessibilityLabel={'Select ' + item.name} onPress={() => chooseDhikr(item.id)} style={({ pressed: p }) => [styles.option, { backgroundColor: active ? palette.primary : palette.surface, borderColor: active ? palette.primaryBright : palette.border, opacity: p ? 0.78 : 1 }]}><DhikrMark palette={palette} size={39} /><View style={styles.optionCopy}><Text style={[styles.optionName, { color: palette.foreground }]}>{item.name}</Text><Text style={[styles.optionArabic, { color: palette.muted }]}>{item.arabic ?? ''}</Text></View><View style={styles.optionMeta}><Text style={[styles.optionCount, { color: active ? palette.primaryForeground : palette.muted }]}>{String(appState.counters[item.id] ?? 0).padStart(3, '0')}</Text>{active ? <Feather name="check" size={18} color={palette.primaryForeground} /> : <Text style={[styles.optionNumber, { color: palette.muted }]}>{String(index + 1).padStart(2, '0')}</Text>}</View></Pressable>; })}</View></View></Modal>

        <Modal visible={dhikrEditorOpen} transparent animationType="slide" onRequestClose={closeDhikrEditor}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={closeDhikrEditor} />
            <ModalKeyboardAvoidingView>
            <View style={[styles.sheet, styles.dhikrFormSheet, { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: Math.max(insets.bottom, 18) + 10 }]}>
              <SheetHandle palette={palette} />
              <View style={styles.sheetHeader}>
                <View><Text style={[styles.sheetTitle, { color: palette.foreground }]}>{editingDhikrId ? 'Edit Dhikr' : 'Add Dhikr'}</Text><Text style={[styles.sheetSubtitle, { color: palette.muted }]}>Name and target only</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close Dhikr form" onPress={closeDhikrEditor} style={[styles.closeButton, { backgroundColor: palette.surface }]}><Feather name="x" size={19} color={palette.foreground} /></Pressable>
              </View>
              <KeyboardAwareScrollViewCompat style={{ flexShrink: 1 }} bottomOffset={64} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.dhikrFormContent, { flexGrow: 1 }]}>
                <TextInput testID="dhikr-name-input" accessibilityLabel="Dhikr name" value={dhikrNameDraft} onChangeText={setDhikrNameDraft} placeholder="Dhikr name *" placeholderTextColor={palette.muted} style={[styles.customTargetInput, { color: palette.foreground, backgroundColor: palette.surface, borderColor: palette.border }]} />
                <Text style={[styles.sectionLabel, { color: palette.muted, marginTop: 6 }]}>TARGET</Text>
                <View style={styles.targetPresetRow}>
                  <Pressable testID="dhikr-target-none" onPress={() => { setDhikrTargetDraft(''); setDhikrCustomTargetOpen(false); }} style={[styles.targetPreset, { backgroundColor: !dhikrCustomTargetOpen && dhikrTargetDraft === '' ? palette.primary : palette.surface, borderColor: palette.border }]}><Text style={[styles.targetPresetText, { color: !dhikrCustomTargetOpen && dhikrTargetDraft === '' ? palette.primaryForeground : palette.foreground }]}>None</Text></Pressable>
                  <Pressable testID="dhikr-target-custom" onPress={() => setDhikrCustomTargetOpen(true)} style={[styles.targetPreset, { backgroundColor: dhikrCustomTargetOpen ? palette.primary : palette.surface, borderColor: palette.border }]}><Text style={[styles.targetPresetText, { color: dhikrCustomTargetOpen ? palette.primaryForeground : palette.foreground }]}>Custom</Text></Pressable>
                </View>
                {dhikrCustomTargetOpen ? <TextInput testID="dhikr-custom-target-input" accessibilityLabel="Custom target" value={dhikrTargetDraft} onChangeText={(value) => setDhikrTargetDraft(value.replace(/[^0-9]/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="1–999999" placeholderTextColor={palette.muted} style={[styles.customTargetInput, { color: palette.foreground, backgroundColor: palette.surface, borderColor: palette.border }]} /> : null}
                <Pressable testID="save-dhikr" accessibilityRole="button" accessibilityLabel={editingDhikrId ? 'Save Dhikr changes' : 'Create Dhikr'} disabled={!dhikrNameDraft.trim() || (dhikrCustomTargetOpen && (!Number.isInteger(Number(dhikrTargetDraft)) || Number(dhikrTargetDraft) < 1 || Number(dhikrTargetDraft) > 999999))} onPress={saveDhikr} style={[styles.formSubmit, { backgroundColor: palette.primary, opacity: !dhikrNameDraft.trim() ? 0.45 : 1 }]}><Text style={[styles.targetPresetText, { color: palette.primaryForeground }]}>{editingDhikrId ? 'Save Changes' : 'Create Dhikr'}</Text></Pressable>
              </KeyboardAwareScrollViewCompat>
            </View>
            </ModalKeyboardAvoidingView>
          </View>
        </Modal>
       <Modal visible={deleteDhikrId !== null} transparent animationType="fade" onRequestClose={() => setDeleteDhikrId(null)}><View style={styles.confirmRoot}><Pressable style={styles.modalBackdrop} onPress={() => setDeleteDhikrId(null)} /><View style={[styles.confirmCard, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={[styles.confirmIcon, { backgroundColor: palette.destructive }]}><Feather name="trash-2" size={22} color={palette.primaryForeground} /></View><Text style={[styles.confirmTitle, { color: palette.foreground }]}>Delete Dhikr?</Text><Text style={[styles.confirmBody, { color: palette.muted }]}>Its current count and target will be removed. History and lifetime totals stay safe.</Text><View style={styles.confirmActions}><Pressable accessibilityRole="button" accessibilityLabel="Cancel delete" onPress={() => setDeleteDhikrId(null)} style={[styles.confirmButton, { backgroundColor: palette.surface }]}><Text style={[styles.confirmButtonText, { color: palette.foreground }]}>Cancel</Text></Pressable><Pressable testID="confirm-delete-dhikr" accessibilityRole="button" accessibilityLabel="Confirm delete Dhikr" onPress={confirmDeleteDhikr} style={[styles.confirmButton, { backgroundColor: palette.destructive }]}><Text style={[styles.confirmButtonText, { color: palette.primaryForeground }]}>Delete</Text></Pressable></View></View></View></Modal>

      <SettingsModal visible={settingsOpen} appState={appState} palette={palette} topInset={insets.top} bottomInset={insets.bottom} onClose={() => setSettingsOpen(false)} onChange={changeSetting} />


      <Modal visible={resetting} transparent animationType="fade" onRequestClose={() => setResetting(false)}><View style={styles.confirmRoot}><Pressable style={styles.modalBackdrop} onPress={() => setResetting(false)} /><View style={[styles.confirmCard, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={[styles.confirmIcon, { backgroundColor: palette.primary }]}><Feather name="rotate-ccw" size={22} color={palette.primaryForeground} /></View><Text style={[styles.confirmTitle, { color: palette.foreground }]}>Reset Counter?</Text><Text style={[styles.confirmBody, { color: palette.muted }]}>This will reset the {selectedDhikr.name} count to 0.</Text><View style={styles.confirmActions}><Pressable accessibilityRole="button" accessibilityLabel="Cancel reset" onPress={() => setResetting(false)} style={[styles.confirmButton, { backgroundColor: palette.surface }]}><Text style={[styles.confirmButtonText, { color: palette.foreground }]}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Confirm reset" onPress={resetCurrent} style={[styles.confirmButton, { backgroundColor: palette.primary }]}><Text style={[styles.confirmButtonText, { color: palette.primaryForeground }]}>Reset</Text></Pressable></View></View></View></Modal>
    </LinearGradient>
  );
}

function HardwareCounter({ count, width, palette, counterImage, counterTheme, scale, pressed, completionFlash, disabled, onPress, onPressIn, onPressOut }: { count: number; width: number; palette: Palette; counterImage: number; counterTheme: AccentTheme; scale: Animated.Value; pressed: boolean; completionFlash: boolean; disabled: boolean; onPress: () => void; onPressIn: () => void; onPressOut: () => void }) {
  const display = String(count).padStart(3, '0');
  const lcdFontSize = getLcdFontSize(count);
  const materialTheme = counterTheme === 'sandalwood' || counterTheme === 'arabesque-white';
  return <View style={[styles.hardware, styles.hardwarePremium, { width, height: width * 1.38, overflow: 'visible', shadowColor: '#000', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } }]}>
    <Image source={counterImage} blurRadius={12} tintColor={palette.primaryBright} resizeMode="contain" style={[styles.hardwareImage, { width: '108%', height: '108%', left: '-4%', top: '-4%', opacity: completionFlash ? 0.68 : materialTheme ? 0.18 : 0.4 }]} />
    <Image source={counterImage} resizeMode="contain" style={styles.hardwareImage} />
      <View testID="counter-display" accessible accessibilityRole="text" accessibilityLabel="Current count" accessibilityLiveRegion="polite" accessibilityValue={{ text: display }} style={styles.liveDisplay}>
        <Animated.Text accessible={false} importantForAccessibility="no" style={[styles.hardwareDigits, { fontSize: lcdFontSize, transform: [{ scale }] }]}>{display}</Animated.Text>
    </View>
    <View pointerEvents="none" style={[styles.dialSurface, pressed && styles.dialSurfacePressed, pressed && { transform: [{ scale: 0.96 }] }]} />
    <Pressable testID="tasbeeh-button" accessibilityRole="button" accessibilityLabel="Increment count" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={[styles.dialHitArea, pressed && styles.dialPressed, pressed && { transform: [{ scale: 0.95 }] }]} />
  </View>;
}

function CounterAtmosphere({ dark, accent, sandalwood = false, arabesqueWhite = false }: { dark: boolean; accent: string; sandalwood?: boolean; arabesqueWhite?: boolean }) {
  return <View pointerEvents="none" style={styles.counterAtmosphere}>
    {arabesqueWhite ? <Image source={ARABESQUE_BACKGROUND} resizeMode="stretch" style={StyleSheet.absoluteFill} /> : dark ? <Image source={CINEMATIC_BACKGROUND} resizeMode="stretch" style={StyleSheet.absoluteFill} /> : <LinearGradient colors={['#f1ece7', '#d8d0c8', '#efe9e4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
    {arabesqueWhite ? <LinearGradient colors={dark ? ['rgba(34, 23, 15, 0.34)', 'rgba(255, 250, 239, 0.06)', 'rgba(34, 23, 15, 0.25)'] : ['rgba(255, 253, 247, 0.12)', 'rgba(255, 253, 247, 0.02)', 'rgba(255, 253, 247, 0.18)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
    <View style={{ position: 'absolute', width: 320, height: 420, borderRadius: 160, top: 165, alignSelf: 'center', backgroundColor: accent, opacity: sandalwood || arabesqueWhite ? dark ? 0.055 : 0.035 : dark ? 0.08 : 0.045, shadowColor: accent, shadowOpacity: sandalwood || arabesqueWhite ? 0.32 : 0.48, shadowRadius: 50, elevation: 2 }} />
    <LinearGradient colors={dark ? ['rgba(5, 5, 5, 0.36)', 'rgba(5, 5, 5, 0.03)', 'rgba(5, 5, 5, 0.58)'] : ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)', 'rgba(30,20,16,0.08)']} locations={[0, 0.48, 1]} style={StyleSheet.absoluteFill} />
    <View style={[styles.atmosphereVignette, { borderColor: dark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(55, 39, 30, 0.08)' }]} />
  </View>;
}

function DhikrMark({ palette, size = 42 }: { palette: Palette; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.primary, borderWidth: 1, borderColor: palette.primaryBright, shadowColor: palette.primaryBright, shadowOpacity: 0.28, shadowRadius: Math.max(7, size * 0.18), shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
    <Text style={{ color: palette.primaryForeground, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: size * 0.42, fontWeight: '700', includeFontPadding: false }}>الله</Text>
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
  const durableTotal = appState.lifetimeCountsByDhikr[id];
  if (typeof durableTotal === 'number') return durableTotal;
  const dailyEntries = appState.dailyCountsByDhikr[id];
  if (dailyEntries && Object.keys(dailyEntries).length > 0) {
    return Object.values(dailyEntries).reduce((sum, value) => sum + value, 0);
  }
  return appState.history.reduce((sum, entry) => entry.dhikrId === id ? sum + entry.repetitions : sum, 0);
}

function HistorySection({ appState, palette, selectedGroupKey, onSelectedGroupKeyChange }: { appState: AppState; palette: Palette; selectedGroupKey: string | null; onSelectedGroupKeyChange: (key: string | null) => void }) {
  const groups = groupHistoryEntries(appState.history, appState.dhikrs);
  const selectedGroup = groups.find((group) => group.key === selectedGroupKey);
  const sectionOrder = ['TODAY', 'YESTERDAY', 'EARLIER'];
  if (appState.history.length === 0) return <EmptyPanel icon="clock" title="No practice history yet" body="Your counting sessions will appear here." palette={palette} />;
  if (selectedGroup) {
    return <View>
      <Pressable testID="history-overview" accessibilityRole="button" accessibilityLabel="Back to History overview" onPress={() => onSelectedGroupKeyChange(null)} style={styles.historyBack}><Feather name="chevron-left" size={18} color={palette.primaryBright} /><Text style={[styles.historyBackText, { color: palette.primaryBright }]}>History overview</Text></Pressable>
      <View style={styles.historyDetailHeading}><Text style={[styles.historyDetailTitle, { color: palette.foreground }]}>{selectedGroup.dhikr}</Text><Text style={[styles.historyDetailSubtitle, { color: palette.muted }]}>Individual sessions kept separate</Text></View>
      {selectedGroup.entries.map((entry) => <View key={entry.id} style={[styles.historySessionRow, { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.card, borderColor: palette.border }]}><DhikrMark palette={palette} size={34} /><View style={styles.historyCopy}><Text style={[styles.historySessionCount, { color: palette.foreground }]}>{entry.repetitions.toLocaleString()} repetitions</Text><Text style={[styles.historyTime, { color: palette.muted }]}>{entry.date ? `${formatHistoryDate(entry.date)}${entry.time ? ` • ${entry.time}` : ''}` : 'Previous session'}</Text></View></View>)}
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
       return <Pressable key={group.key} testID={`history-group-${group.key}`} accessibilityRole="button" accessibilityLabel={`View ${group.dhikr} sessions`} onPress={() => onSelectedGroupKeyChange(group.key)} style={({ pressed }) => [styles.historyGroupRow, styles.premiumHistoryGroup, { backgroundColor: palette.card, borderColor: palette.border, opacity: pressed ? 0.78 : 1 }]}><DhikrMark palette={palette} size={38} /><View style={styles.historyGroupCopy}><Text style={[styles.historyName, { color: palette.foreground }]}>{group.dhikr}</Text><Text style={[styles.historySummary, { color: palette.primaryBright }]}>{total.toLocaleString()} repetitions</Text><Text style={[styles.historyLatest, { color: palette.muted }]}>{dateNote ? `${dateNote} • ` : ''}{sessionNote}</Text></View><Feather name="chevron-right" size={18} color={palette.muted} /></Pressable>;
    })}</View>;
  })}</View>;
}

function SecondaryTab({ tab, palette, appState, todayCount, weekCount, totalCount, historyGroupKey, onHistoryGroupChange, onChooseDhikr, onAddDhikr, onEditDhikr, onDeleteDhikr }: { tab: Tab; palette: Palette; appState: AppState; todayCount: number; weekCount: number; totalCount: number; historyGroupKey: string | null; onHistoryGroupChange: (key: string | null) => void; onChooseDhikr: (id: string) => void; onAddDhikr: () => void; onEditDhikr: (item: DhikrRecord) => void; onDeleteDhikr: (id: string) => void }) {
  const insets = useSafeAreaInsets();
  const secondarySafeTop = Platform.OS === 'ios' ? Math.max(insets.top, 52) : Platform.OS === 'android' ? Math.max(insets.top, 24) : Math.max(insets.top, 18);
  const isLibrary = tab === 'dhikrs';
  const title = tab === 'history' ? 'History' : tab === 'stats' ? 'Statistics' : 'Dhikrs';
  const subtitle = isLibrary ? 'Add, manage and remember.\nKeep your heart connected.' : tab === 'history' ? 'Your recent remembrance sessions' : 'A quiet view of your progress';
  return <View style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
     <CounterAtmosphere dark={appState.theme !== 'light'} accent={palette.primaryBright} sandalwood={appState.accentTheme === 'sandalwood'} arabesqueWhite={appState.accentTheme === 'arabesque-white'} />
    <ScrollView style={{ zIndex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.secondaryContent, { paddingTop: secondarySafeTop + 18, paddingBottom: 110 + Math.max(insets.bottom, 14) }]}>
      <View style={[styles.secondaryHeader, { borderBottomWidth: 1, borderBottomColor: palette.border, paddingBottom: 16, marginBottom: 20 }]}>
        <Text style={[styles.secondaryTitle, isLibrary && { fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 38, fontWeight: '400', letterSpacing: -0.8 }, { color: palette.foreground }]}>{title}</Text>
        <Text style={[styles.secondarySubtitle, isLibrary && { fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 15, lineHeight: 21 }, { color: palette.muted }]}>{subtitle}</Text>
      </View>
       {tab === 'history' ? <HistorySection appState={appState} palette={palette} selectedGroupKey={historyGroupKey} onSelectedGroupKeyChange={onHistoryGroupChange} />
        : tab === 'stats' ? <View>
          <View style={styles.statsGrid}><MetricCard icon="calendar-today" label="Today" value={todayCount} palette={palette} /><MetricCard icon="calendar-week" label="This Week" value={weekCount} palette={palette} /><MetricCard icon="chart-bar" label="All Time" value={totalCount} palette={palette} /></View>
          <View style={[styles.byDhikrPanel, { backgroundColor: palette.card, borderColor: palette.border, shadowColor: palette.shadow, shadowOpacity: 0.2, shadowRadius: 18, elevation: 5 }]}><Text style={[styles.byDhikrTitle, { color: palette.foreground }]}>By Dhikr</Text>{appState.dhikrs.length === 0 ? <EmptyPanel icon="bookmark" title="No Dhikrs yet" body="Add a Dhikr to see lifetime totals by remembrance." palette={palette} /> : appState.dhikrs.map((item) => <View key={item.id} style={[styles.byDhikrRow, { borderBottomColor: palette.border }]}><DhikrMark palette={palette} size={34} /><Text style={[styles.byDhikrName, { color: palette.foreground }]} numberOfLines={1}>{item.name}</Text><Text style={[styles.byDhikrValue, { color: palette.primaryBright }]}>{lifetimeTotalForDhikr(appState, item.id).toLocaleString()}</Text></View>)}</View>
        </View>
        : <View>
          <Pressable testID="add-dhikr" accessibilityRole="button" accessibilityLabel="Add Dhikr" onPress={onAddDhikr} style={({ pressed }) => [styles.plusButton, styles.premiumPrimaryButton, { alignSelf: 'flex-end', backgroundColor: palette.primary, borderColor: palette.primaryBright, width: 158, height: 50, borderRadius: 28, marginBottom: 16, shadowColor: palette.primary, shadowOpacity: 0.42, shadowRadius: 16, elevation: 8 }, pressed && styles.pressed]}><Feather name="plus" size={20} color={palette.primaryForeground} /><Text style={[styles.plusText, { color: palette.primaryForeground, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 16 }]}>Add Dhikr</Text></Pressable>
           {appState.dhikrs.length === 0 ? <EmptyPanel icon="bookmark" title="Your Dhikr Library is Empty" body="Add your first Dhikr to begin counting." palette={palette} /> : appState.dhikrs.map((item) => <View key={item.id} testID={`dhikr-row-${item.id}`} style={[styles.libraryRow, styles.premiumLibraryRow, { minHeight: 92, borderRadius: 22, paddingHorizontal: 13, backgroundColor: appState.accentTheme === 'sandalwood' ? 'rgba(42, 27, 19, 0.92)' : appState.accentTheme === 'arabesque-white' ? 'rgba(255, 253, 247, 0.9)' : 'rgba(25, 22, 21, 0.9)', borderColor: palette.border, shadowColor: palette.primary, shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 6 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Select ${item.name}`} onPress={() => onChooseDhikr(item.id)} style={[styles.librarySelect, { minHeight: 78 }]}>
              <DhikrMark palette={palette} size={56} />
               <View style={[styles.historyCopy, { paddingLeft: 14 }]}><Text style={[styles.historyName, { color: appState.accentTheme === 'arabesque-white' ? colors.arabesqueWhite.light.foreground : palette.foreground, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 18 }]} numberOfLines={1}>{item.name}</Text><Text style={[styles.libraryTarget, { color: appState.accentTheme === 'arabesque-white' ? colors.arabesqueWhite.light.muted : palette.muted, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 13, marginTop: 5 }]}>Target: {appState.targets[item.id] ? appState.targets[item.id] : 'Not set'}</Text></View>
            </Pressable>
             <View style={[styles.libraryMeta, { alignItems: 'center', justifyContent: 'center', gap: 8, paddingLeft: 5 }]}><Feather name="chevron-right" size={23} color={palette.foreground} /><View style={[styles.libraryActions, { gap: 2 }]}><Pressable testID={`edit-dhikr-${item.id}`} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} onPress={() => onEditDhikr(item)} style={[styles.libraryAction, { backgroundColor: 'transparent', opacity: 0.58 }]}><Feather name="edit-3" size={14} color={palette.muted} /></Pressable><Pressable testID={`delete-dhikr-${item.id}`} accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`} onPress={() => onDeleteDhikr(item.id)} style={[styles.libraryAction, { backgroundColor: 'transparent', opacity: 0.58 }]}><Feather name="trash-2" size={14} color={palette.muted} /></Pressable></View></View>
          </View>)}
        </View>}
    </ScrollView>
  </View>;
}

function EmptyPanel({ icon, title, body, palette }: { icon: keyof typeof Feather.glyphMap; title: string; body: string; palette: Palette }) { return <View style={[styles.emptyPanel, styles.premiumEmptyPanel, { backgroundColor: palette.card, borderColor: palette.border }]}><Feather name={icon} size={25} color={palette.primaryBright} /><Text style={[styles.emptyTitle, { color: palette.foreground }]}>{title}</Text><Text style={[styles.emptyBody, { color: palette.muted }]}>{body}</Text></View>; }
 function TabBar({ activeTab, palette, onChange, bottomInset }: { activeTab: Tab; palette: Palette; onChange: (tab: Tab) => void; bottomInset: number }) { const items: Array<{ id: Tab; label: string; icon: keyof typeof Feather.glyphMap }> = [{ id: 'counter', label: 'Tasbeeh', icon: 'smartphone' }, { id: 'history', label: 'History', icon: 'list' }, { id: 'stats', label: 'Stats', icon: 'bar-chart-2' }, { id: 'dhikrs', label: 'Dhikrs', icon: 'bookmark' }]; return <View style={[styles.tabBar, styles.premiumTabBar, { backgroundColor: palette.background, borderTopColor: palette.border, paddingBottom: Math.max(bottomInset, 9) }]}>{items.map((item) => { const active = activeTab === item.id; return <Pressable key={item.id} testID={`open-${item.id}`} accessibilityRole="button" accessibilityLabel={'Open ' + item.label} onPress={() => onChange(item.id)} style={({ pressed: p }) => [styles.tabItem, p && styles.pressed]}><View style={styles.tabIconWrap}><Feather name={item.icon} size={21} color={active ? palette.primaryBright : palette.muted} /></View><Text style={[styles.tabLabel, { color: active ? palette.primaryBright : palette.muted }]}>{item.label}</Text>{active ? <View style={[themeStyles.themeTabIndicator, { backgroundColor: palette.primaryBright, shadowColor: palette.primaryBright }]} /> : null}</Pressable>; })}</View>; }
function IconButton({ icon, label, onPress, palette, accent = false }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; palette: Palette; accent?: boolean }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed: p }) => [styles.iconButton, { opacity: p ? 0.66 : 1 }]}><Feather name={icon} size={25} color={accent ? palette.primaryBright : palette.foreground} /></Pressable>; }
function SettingsModal({ visible, appState, palette, topInset, bottomInset, onClose, onChange }: { visible: boolean; appState: AppState; palette: Palette; topInset: number; bottomInset: number; onClose: () => void; onChange: <Key extends keyof AppState>(key: Key, value: AppState[Key]) => void }) {
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={[styles.settingsRoot, { backgroundColor: palette.background, paddingTop: topInset + 12, paddingBottom: Math.max(bottomInset, 18) }]}>
      <CounterAtmosphere dark={appState.theme !== 'light'} accent={palette.primaryBright} sandalwood={appState.accentTheme === 'sandalwood'} arabesqueWhite={appState.accentTheme === 'arabesque-white'} />
      <View style={themeStyles.settingsLayer}>
        <View style={styles.settingsHeader}><View><Text style={[styles.sheetTitle, { color: palette.foreground }]}>Settings</Text><Text style={[styles.sheetSubtitle, { color: palette.muted }]}>Make the practice feel like yours</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close settings" onPress={onClose} style={[styles.closeButton, { backgroundColor: palette.surface }]}><Feather name="x" size={19} color={palette.foreground} /></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsScroll}>
          <SettingsSection title="COUNTER" palette={palette}>
            <SettingRow icon="vibrate" label="Vibration" value={appState.vibration} onValueChange={(value) => onChange('vibration', value)} palette={palette} />
            <SettingDivider palette={palette} />
            <SettingRow icon="volume-2" label="Sound" value={appState.sound} onValueChange={(value) => onChange('sound', value)} palette={palette} feather />
            <SettingDivider palette={palette} />
            <SettingRow icon="activity" label="Counter animation" value={appState.counterAnimation} onValueChange={(value) => onChange('counterAnimation', value)} palette={palette} feather />
            <SettingDivider palette={palette} />
            <SettingRow icon="flag" label="Stop counting at target" value={appState.stopAtTarget} onValueChange={(value) => onChange('stopAtTarget', value)} palette={palette} feather />
          </SettingsSection>
          <SettingsSection title="APPEARANCE" palette={palette}>
            <AccentThemePicker value={appState.accentTheme} onChange={(theme) => onChange('accentTheme', theme)} palette={palette} />
            <SettingDivider palette={palette} />
            <View style={styles.themeRow}><View style={[styles.settingIcon, { backgroundColor: palette.primary }]}><Feather name="sun" size={17} color={palette.primaryForeground} /></View><Text style={[styles.settingLabel, { color: palette.foreground }]}>Mode</Text><View style={[styles.segmented, { backgroundColor: palette.surface }]}>{(['dark', 'light'] as const).map((theme) => <Pressable key={theme} testID={`display-mode-${theme}`} onPress={() => onChange('theme', theme)} style={[styles.segment, appState.theme === theme && { backgroundColor: palette.primary }]}><Feather name={theme === 'dark' ? 'moon' : 'sun'} size={14} color={appState.theme === theme ? palette.primaryForeground : palette.muted} /><Text style={[styles.segmentText, { color: appState.theme === theme ? palette.primaryForeground : palette.muted }]}>{theme === 'dark' ? 'Dark' : 'Light'}</Text></Pressable>)}</View></View>
          </SettingsSection>
          <SettingsSection title="ABOUT" palette={palette}><View style={styles.aboutRow}><View style={[styles.aboutMark, { backgroundColor: palette.primary }]}><MaterialCommunityIcons name="counter" size={21} color={palette.primaryForeground} /></View><View style={styles.aboutCopy}><Text style={[styles.aboutTitle, { color: palette.foreground }]}>Tasbeeh</Text><Text style={[styles.aboutBody, { color: palette.muted }]}>A quiet place to remember.</Text></View><Text style={[styles.version, { color: palette.muted }]}>v1.0</Text></View></SettingsSection>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

function SettingRow({ icon, label, value, onValueChange, palette, feather = false }: { icon: string; label: string; value: boolean; onValueChange: (value: boolean) => void; palette: Palette; feather?: boolean }) { return <View style={styles.settingRow}><View style={[styles.settingIcon, { backgroundColor: palette.primary }]}>{feather ? <Feather name={icon as keyof typeof Feather.glyphMap} size={17} color={palette.primaryForeground} /> : <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color={palette.primaryForeground} />}</View><Text style={[styles.settingLabel, { color: palette.foreground }]}>{label}</Text><Switch testID={'toggle-' + label.toLowerCase().replace(' ', '-')} accessibilityLabel={'Toggle ' + label} value={value} onValueChange={onValueChange} trackColor={{ false: palette.surfaceStrong, true: palette.greenSoft }} thumbColor={value ? palette.primaryBright : palette.muted} ios_backgroundColor={palette.surfaceStrong} /></View>; }
function AccentThemePicker({ value, onChange, palette }: { value: AccentTheme; onChange: (theme: AccentTheme) => void; palette: Palette }) {
  const options: Array<{ id: AccentTheme; label: string; color: string; image?: number }> = [
    { id: 'red', label: 'Classic Red', color: colors.accents.red.primaryBright },
    { id: 'green', label: 'Jannah Green', color: colors.accents.green.primaryBright },
    { id: 'blue', label: 'Ocean Blue', color: colors.accents.blue.primaryBright },
    { id: 'sandalwood', label: 'Sandalwood Classic', color: colors.accents.sandalwood.primaryBright, image: COUNTER_IMAGES.sandalwood },
    { id: 'arabesque-white', label: 'Arabesque White', color: colors.accents['arabesque-white'].primaryBright, image: COUNTER_IMAGES['arabesque-white'] },
  ];
    return <View style={{ paddingVertical: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}><View style={[styles.settingIcon, { backgroundColor: palette.primary }]}><Feather name="droplet" size={17} color={palette.primaryForeground} /></View><View><Text style={[styles.settingLabel, { color: palette.foreground }]}>Visual theme</Text><Text style={[styles.settingHint, { color: palette.muted }]}>Choose an accent, glow and atmosphere</Text></View></View>
    <View style={themeStyles.themePickerGrid}>{options.map((option) => { const selected = value === option.id; return <Pressable key={option.id} testID={`accent-theme-${option.id}`} accessibilityRole="button" accessibilityLabel={`Use ${option.label} theme`} accessibilityState={{ selected }} onPress={() => onChange(option.id)} style={({ pressed }) => [themeStyles.themeOption, { borderColor: selected ? option.color : palette.border, backgroundColor: palette.surface, opacity: pressed ? 0.72 : 1 }, selected && { shadowColor: option.color, shadowOpacity: 0.28, shadowRadius: 10, elevation: 4 }]}>{option.image ? <Image source={option.image} resizeMode="contain" style={themeStyles.themePreviewImage} /> : <View style={[themeStyles.themeSwatch, { backgroundColor: option.color, borderColor: selected ? palette.primaryForeground : option.color }]}>{selected ? <Feather name="check" size={12} color={palette.primaryForeground} /> : null}</View>}<Text style={{ color: selected ? palette.foreground : palette.muted, fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 7, textAlign: 'center' }}>{option.label}</Text>{selected ? <Text style={[themeStyles.selectedThemeLabel, { color: option.color }]}>Selected</Text> : null}</Pressable>; })}</View>
  </View>;
}

function SettingDivider({ palette }: { palette: Palette }) { return <View style={[styles.settingDivider, { backgroundColor: palette.border }]} />; }
function SettingsSection({ title, children, palette }: { title: string; children: React.ReactNode; palette: Palette }) { return <View style={styles.settingsSection}><Text style={[styles.sectionLabel, { color: palette.primaryBright }]}>{title}</Text><View style={[styles.settingsGroup, styles.premiumSettingsGroup, { backgroundColor: palette.card, borderColor: palette.border, shadowColor: palette.shadow, shadowOpacity: 0.2, shadowRadius: 18, elevation: 5 }]}>{children}</View></View>; }
function SheetHandle({ palette }: { palette: Palette }) { return <View style={[styles.sheetHandle, { backgroundColor: palette.surfaceStrong }]} />; }

const styles = StyleSheet.create({
  root: { flex: 1 }, scrollContent: { paddingHorizontal: 21 }, topBar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, greeting: { alignItems: 'center', gap: 1 }, eyebrow: { fontFamily: 'Inter_400Regular', fontSize: 13 }, greetingName: { fontFamily: 'Inter_700Bold', fontSize: 21 }, sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 9 }, selector: { minHeight: 72, borderRadius: 31, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', position: 'relative', marginTop: 5, marginBottom: 13, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 6 }, selectorMain: { flex: 1, minHeight: 62, flexDirection: 'row', alignItems: 'center' }, selectorIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, selectorCopy: { flex: 1, paddingLeft: 12 }, selectorName: { fontFamily: 'Inter_600SemiBold', fontSize: 16 }, arabic: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }, targetPill: { minHeight: 31, minWidth: 80, borderRadius: 16, paddingHorizontal: 9, marginLeft: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, targetPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 }, selectorProgressTrack: { position: 'absolute', left: 64, right: 13, bottom: 5, height: 3, borderRadius: 2, overflow: 'hidden' }, selectorProgress: { height: '100%', borderRadius: 2 }, hardware: { borderRadius: 74, overflow: 'hidden', alignSelf: 'center', position: 'relative', shadowOpacity: 0.52, shadowRadius: 26, shadowOffset: { width: 0, height: 18 }, elevation: 15 }, hardwareImage: { position: 'absolute', width: '100%', height: '100%', left: 0, top: 0 }, liveDisplay: { position: 'absolute', left: '18%', top: '13%', width: '59%', height: '20%', alignItems: 'flex-end', justifyContent: 'center', paddingRight: 10, overflow: 'hidden' }, ghostDigits: { position: 'absolute', right: 8, top: 5, fontFamily: 'monospace', fontSize: 55, letterSpacing: 1, color: '#AAB2A8', opacity: 0.19 }, hardwareDigits: { color: '#060807', fontFamily: 'monospace', fontSize: 57, fontWeight: '800', letterSpacing: -2 }, deviceLabels: { position: 'absolute', top: '35%', left: '18%', right: '18%', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 }, deviceLabel: { color: '#ECEAE7', fontFamily: 'Inter_500Medium', fontSize: 16, letterSpacing: 0.2 }, dialHitArea: { position: 'absolute', left: '11%', top: '50%', width: '78%', height: '49%', borderRadius: 1000 }, dialPressed: { transform: [{ scale: 0.95 }, { translateY: 5 }] }, metricsRow: { flexDirection: 'row', gap: 9, marginTop: 12 }, metricCard: { flex: 1, minHeight: 88, borderRadius: 17, borderWidth: 1, padding: 12, justifyContent: 'space-between' }, metricLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }, metricValue: { fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 4 }, metricUnderline: { width: 28, height: 2, marginTop: 4 }, goalCard: { minHeight: 62, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 9 }, goalIcon: { width: 33, height: 33, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }, goalCopy: { width: 80 }, goalLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 }, goalValue: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }, goalProgressWrap: { flex: 1 }, goalTrack: { height: 7, borderRadius: 4, overflow: 'hidden' }, goalProgress: { height: '100%', borderRadius: 4 }, goalPercent: { fontFamily: 'Inter_500Medium', fontSize: 12 }, actionBar: { minHeight: 69, borderRadius: 35, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 }, actionItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 7, minHeight: 44 }, actionDivider: { width: 1, height: 35 }, actionText: { fontFamily: 'Inter_500Medium', fontSize: 12 }, plusButton: { width: 168, height: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 7 }, elevation: 8 }, plusText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 25 }, pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] }, offlineNote: { fontFamily: 'Inter_400Regular', fontSize: 11, textAlign: 'center', marginTop: 14 }, tabBar: { position: 'absolute', bottom: 0, left: 0, right: 0, minHeight: 74, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 8 }, tabItem: { alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 62 }, tabLabel: { fontFamily: 'Inter_500Medium', fontSize: 11 }, secondaryContent: { paddingHorizontal: 21 }, secondaryHeader: { marginBottom: 18 }, secondaryTitle: { fontFamily: 'Inter_700Bold', fontSize: 28 }, secondarySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 6 }, historyRow: { minHeight: 68, borderRadius: 17, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 9 }, historyIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, historyCopy: { flex: 1, paddingLeft: 11 }, historyName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 }, historyTime: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, historyCount: { fontFamily: 'Inter_700Bold', fontSize: 16 }, libraryRow: { minHeight: 68, borderRadius: 17, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 9 }, libraryMeta: { alignItems: 'flex-end', gap: 3 }, libraryTarget: { fontFamily: 'Inter_400Regular', fontSize: 10 }, statsGrid: { flexDirection: 'row', gap: 10 }, longPanel: { borderRadius: 20, borderWidth: 1, padding: 20, marginTop: 12 }, panelEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2 }, panelTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: 14 }, panelBody: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 6 }, emptyPanel: { minHeight: 190, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 25 }, emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 13 }, emptyBody: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 7, maxWidth: 250 },
   modalRoot: { flex: 1, justifyContent: 'flex-end' }, modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.72)' }, sheet: { borderTopLeftRadius: 31, borderTopRightRadius: 31, borderWidth: 1, padding: 20, paddingTop: 12 }, dhikrFormSheet: { maxHeight: '92%' }, dhikrFormContent: { gap: 10, paddingBottom: 4 }, formSubmit: { minHeight: 49, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 19 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, sheetTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 }, sheetSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }, closeButton: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, option: { minHeight: 62, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginTop: 9 }, optionIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, optionCopy: { flex: 1, paddingLeft: 11 }, optionName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 }, optionArabic: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, optionMeta: { alignItems: 'flex-end', gap: 5, paddingLeft: 8 }, optionCount: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 1 }, optionNumber: { fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 1 }, targetPresetRow: { flexDirection: 'row', gap: 8 }, targetPreset: { flex: 1, minHeight: 48, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }, targetPresetText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 }, customTargetRow: { flexDirection: 'row', gap: 9, marginTop: 12 }, customTargetInput: { flex: 1, minHeight: 49, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, fontFamily: 'Inter_500Medium', fontSize: 15 }, customTargetSave: { width: 80, minHeight: 49, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, targetHint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, marginTop: 14 }, settingsRoot: { flex: 1, paddingHorizontal: 20 }, settingsHeader: { minHeight: 73, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, settingsScroll: { paddingTop: 14, paddingBottom: 30 }, settingsSection: { marginBottom: 22 }, settingsGroup: { borderRadius: 23, borderWidth: 1, paddingHorizontal: 15 }, settingDivider: { height: 1, marginLeft: 48 }, settingRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, settingLabel: { fontFamily: 'Inter_500Medium', fontSize: 15, flex: 1 }, themeRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12 }, segmented: { flexDirection: 'row', borderRadius: 13, padding: 3, gap: 2 }, segment: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10 }, segmentText: { fontFamily: 'Inter_500Medium', fontSize: 11 }, settingInfoRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingHint: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, aboutRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center' }, aboutMark: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, aboutCopy: { flex: 1, paddingLeft: 12 }, aboutTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 }, aboutBody: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }, version: { fontFamily: 'Inter_500Medium', fontSize: 11 }, menuRoot: { flex: 1 }, menuCard: { marginHorizontal: 16, borderRadius: 24, borderWidth: 1, padding: 14, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 }, menuBrandRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 13 }, menuMark: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 11 }, menuTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 }, menuSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }, menuAction: { minHeight: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12 }, menuActionText: { fontFamily: 'Inter_500Medium', fontSize: 14, flex: 1 }, confirmRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 }, confirmCard: { width: '100%', borderRadius: 27, borderWidth: 1, padding: 22, alignItems: 'center' }, confirmIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 15 }, confirmTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 }, confirmBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 250 }, confirmActions: { width: '100%', flexDirection: 'row', gap: 9, marginTop: 22 }, confirmButton: { flex: 1, minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, confirmButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  librarySelect: { flex: 1, minHeight: 62, flexDirection: 'row', alignItems: 'center' }, libraryActions: { flexDirection: 'row', gap: 8 }, libraryAction: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, byDhikrPanel: { borderRadius: 20, borderWidth: 1, padding: 18, marginTop: 14 }, byDhikrTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 6 }, byDhikrRow: { minHeight: 49, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' }, byDhikrName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, paddingLeft: 10, paddingRight: 12 }, byDhikrValue: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  historyDateSection: { marginBottom: 18 }, historyDateLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 9 }, historyGroupRow: { minHeight: 78, borderRadius: 17, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 9 }, historyGroupCopy: { flex: 1, paddingLeft: 11, paddingRight: 9 }, historySummary: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 4 }, historyLatest: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, historyBack: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }, historyBackText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 }, historyDetailHeading: { marginBottom: 14 }, historyDetailTitle: { fontFamily: 'Inter_700Bold', fontSize: 21 }, historyDetailSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }, historySessionRow: { minHeight: 63, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center', marginBottom: 9 }, historySessionCount: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  premiumSelector: { shadowOpacity: 0.28, shadowRadius: 19, shadowOffset: { width: 0, height: 9 }, elevation: 8 }, premiumActionBar: { shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 }, premiumPrimaryButton: { borderWidth: 1, shadowOpacity: 0.32, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 7 }, hardwarePremium: {}, lcdGlass: { position: 'absolute', left: '17.5%', top: '12.5%', width: '60%', height: '21%', borderRadius: 12, backgroundColor: 'rgba(205,214,198,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, dialSurface: { position: 'absolute', left: '14%', top: '61%', width: '72%', height: '38%', borderRadius: 1000, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.015)' }, dialSurfacePressed: { transform: [{ scale: 0.96 }, { translateY: 5 }], backgroundColor: 'rgba(0,0,0,0.08)' }, premiumLibraryRow: { shadowOpacity: 0.16, shadowRadius: 13, shadowOffset: { width: 0, height: 6 }, elevation: 4 }, libraryLifetime: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }, premiumMetricCard: { minHeight: 104, borderRadius: 20, padding: 14, shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 }, premiumMetricValue: { fontSize: 23, letterSpacing: -0.5 }, premiumHistoryGroup: { borderRadius: 20, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 }, premiumEmptyPanel: { shadowOpacity: 0.13, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 4 }, premiumSettingsGroup: { shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 4 }, premiumTabBar: { shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: -5 }, elevation: 10 }, tabIconWrap: { minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  counterScroll: { flex: 1 }, counterScrollContent: { flexGrow: 1 }, counterAtmosphere: { ...StyleSheet.absoluteFill, overflow: 'hidden' }, counterLayer: { zIndex: 1 }, referenceTopBar: { minHeight: 66 }, referenceTopBarCompact: { minHeight: 58 }, counterHeaderCopy: { alignItems: 'center', flex: 1 }, counterTitle: { fontFamily: Platform.OS === 'ios' ? 'Baskerville' : Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 28, fontStyle: 'italic', fontWeight: '600', letterSpacing: 0.3 }, titleDivider: { width: 58, height: 1, marginTop: 8, opacity: 0.9 }, counterSubtitle: { fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 13, marginTop: 2, letterSpacing: 0.1 }, referenceSelector: { minHeight: 88, borderRadius: 27, marginTop: 10, marginBottom: 10, paddingHorizontal: 13 }, referenceSelectorCompact: { minHeight: 80, marginTop: 6, marginBottom: 6 }, referenceSelectorIcon: { width: 54, height: 54, borderRadius: 27 }, referenceSelectorIconCompact: { width: 48, height: 48, borderRadius: 24 }, counterDeviceStage: { minHeight: 450, alignItems: 'center', justifyContent: 'center', position: 'relative' }, counterDeviceStageCompact: { minHeight: 350 }, deviceAmbientGlow: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(218, 17, 27, 0.13)', shadowColor: '#F51E2B', shadowOpacity: 0.54, shadowRadius: 58, elevation: 2, transform: [{ rotate: '-7deg' }] }, deviceSideGlow: { position: 'absolute', width: 88, height: 250, borderRadius: 44, backgroundColor: 'rgba(235, 24, 35, 0.1)', shadowColor: '#FF2634', shadowOpacity: 0.42, shadowRadius: 38, elevation: 2 }, deviceSideGlowLeft: { left: 30, top: 94, transform: [{ rotate: '8deg' }] }, deviceSideGlowRight: { right: 27, top: 118, height: 210, transform: [{ rotate: '-11deg' }] }, deviceGlowComplete: { backgroundColor: 'rgba(255, 38, 49, 0.22)', shadowOpacity: 0.8, shadowRadius: 66 }, deviceContactShadow: { position: 'absolute', bottom: 28, width: 230, height: 38, borderRadius: 115, backgroundColor: 'rgba(0, 0, 0, 0.42)', shadowColor: '#000', shadowOpacity: 0.7, shadowRadius: 22, elevation: 1 }, counterQuote: { minHeight: 84, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, marginTop: 10 }, counterQuoteCompact: { minHeight: 60, marginTop: 2 }, counterQuoteText: { fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontStyle: 'italic', fontSize: 14, lineHeight: 20, textAlign: 'center' }, counterQuoteRule: { width: 44, height: 2, borderRadius: 1, marginTop: 8 }, counterQuoteCitation: { fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 10, fontStyle: 'italic', marginTop: 5 }, referenceActions: { flexDirection: 'row', gap: 10, marginTop: 3 }, referenceActionsCompact: { marginTop: 0 }, referenceAction: { flex: 1, minHeight: 58, borderRadius: 30, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }, referenceActionCompact: { minHeight: 52 }, resetAction: {}, saveAction: { shadowColor: '#E51D2A', shadowOpacity: 0.52, shadowRadius: 18 }, referenceActionText: { fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 17, fontWeight: '600' }, atmosphereGlow: { position: 'absolute', width: 310, height: 390, borderRadius: 155, top: 190, alignSelf: 'center', shadowColor: '#D51F2A', shadowOpacity: 0.45, shadowRadius: 44 }, atmosphereVignette: { ...StyleSheet.absoluteFill, borderWidth: 24, borderRadius: 34 },
});

const themeStyles = StyleSheet.create({
  titleDivider: { width: 58, height: 1, marginTop: 8, opacity: 0.9 },
  themeTabIndicator: { width: 22, height: 2, borderRadius: 2, marginTop: 2, shadowOpacity: 0.7, shadowRadius: 5, shadowOffset: { width: 0, height: 0 }, elevation: 3 },
  settingsLayer: { flex: 1, zIndex: 1 },
  themePickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeOption: { width: '48%', minHeight: 108, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 8 },
  themeSwatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  themePreviewImage: { width: 40, height: 53 },
  selectedThemeLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, marginTop: 3, letterSpacing: 0.3 },
});

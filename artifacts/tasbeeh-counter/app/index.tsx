import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';

type Dhikr = { id: string; name: string; arabic: string; icon: keyof typeof MaterialCommunityIcons.glyphMap };
type AppState = { selectedId: string; counters: Record<string, number>; vibration: boolean; sound: boolean; counterAnimation: boolean; autoSave: boolean; theme: 'dark' | 'light' };
const STORAGE_KEY = 'tasbeeh-counter-state-v1';
const DEFAULT_DHIKR: Dhikr[] = [
  { id: 'subhanallah', name: 'SubhanAllah', arabic: 'سُبْحَانَ ٱللَّٰهِ', icon: 'leaf' },
  { id: 'alhamdulillah', name: 'Alhamdulillah', arabic: 'ٱلْحَمْدُ لِلَّٰهِ', icon: 'flower-tulip' },
  { id: 'allahu-akbar', name: 'Allahu Akbar', arabic: 'ٱللَّٰهُ أَكْبَرُ', icon: 'star-four-points' },
  { id: 'la-ilaha', name: 'La ilaha illallah', arabic: 'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ', icon: 'infinity' },
  { id: 'astaghfirullah', name: 'Astaghfirullah', arabic: 'أَسْتَغْفِرُ ٱللَّٰهَ', icon: 'water-outline' },
  { id: 'subhanallahi', name: 'SubhanAllahi wa bihamdihi', arabic: 'سُبْحَانَ ٱللَّٰهِ وَبِحَمْدِهِ', icon: 'weather-sunny' },
];
const DEFAULT_COUNTERS: Record<string, number> = { subhanallah: 289, alhamdulillah: 120, 'allahu-akbar': 67, 'la-ilaha': 43, astaghfirullah: 56, subhanallahi: 31 };
const DEFAULT_STATE: AppState = { selectedId: 'subhanallah', counters: DEFAULT_COUNTERS, vibration: true, sound: true, counterAnimation: true, autoSave: true, theme: 'dark' };

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [appState, setAppState] = useState<AppState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const countScale = useRef(new Animated.Value(1)).current;
  const tapSound = useRef<Audio.Sound | null>(null);
  const webAudio = useRef<AudioContext | null>(null);
  const savedCounters = useRef<Record<string, number>>(DEFAULT_COUNTERS);
  const palette = appState.theme === 'light' ? colors.light : colors.dark;
  const selectedDhikr = useMemo(() => DEFAULT_DHIKR.find((item) => item.id === appState.selectedId) ?? DEFAULT_DHIKR[0], [appState.selectedId]);
  const currentCount = appState.counters[selectedDhikr.id] ?? 0;

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && active) {
          const parsed = JSON.parse(raw) as Partial<AppState>;
          const counters = { ...DEFAULT_COUNTERS, ...(parsed.counters ?? {}) };
          savedCounters.current = counters;
          setAppState({ ...DEFAULT_STATE, ...parsed, counters, theme: parsed.theme === 'light' ? 'light' : 'dark' });
        }
      } catch {
        // A fresh default state is safe when local storage is unavailable.
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
        const result = await Audio.Sound.createAsync(require('../assets/sounds/tap.wav'), { shouldPlay: false, volume: 0.42 });
        if (active) tapSound.current = result.sound;
        else await result.sound.unloadAsync();
      } catch {
        // Web Audio remains available where native audio cannot be prepared.
      }
    };
    void prepareSound();
    return () => { active = false; if (tapSound.current) void tapSound.current.unloadAsync(); };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const countersToPersist = appState.autoSave ? appState.counters : savedCounters.current;
    if (appState.autoSave) savedCounters.current = appState.counters;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...appState, counters: countersToPersist }));
  }, [appState, hydrated]);

  const playClick = async () => {
    if (tapSound.current) {
      try { await tapSound.current.replayAsync(); return; } catch { /* use web oscillator below */ }
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
      } catch { /* sound is optional and never blocks counting */ }
    }
  };

  const increment = () => {
    const nextCount = Math.min(999999, currentCount + 1);
    setAppState((previous) => ({ ...previous, counters: { ...previous.counters, [selectedDhikr.id]: nextCount } }));
    if (appState.vibration) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (appState.sound) void playClick();
    if (appState.counterAnimation) {
      countScale.setValue(0.97);
      Animated.timing(countScale, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
  };
  const changeSetting = <K extends keyof AppState>(key: K, value: AppState[K]) => setAppState((previous) => ({ ...previous, [key]: value }));
  const resetCurrent = () => { setResetting(false); setAppState((previous) => ({ ...previous, counters: { ...previous.counters, [selectedDhikr.id]: 0 } })); };
  const chooseDhikr = (id: string) => { setAppState((previous) => ({ ...previous, selectedId: id })); setSelectorOpen(false); };

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <StatusBar barStyle={appState.theme === 'dark' ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 24) + 28 }]} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.topBar}>
          <IconButton icon="menu" label="Open menu" onPress={() => setMenuOpen(true)} palette={palette} />
          <View style={styles.greeting}><Text style={[styles.eyebrow, { color: palette.muted }]}>Assalamu Alaikum,</Text><Text style={[styles.greetingName, { color: palette.primaryBright }]}>Farhaan</Text></View>
          <IconButton icon="settings" label="Open settings" onPress={() => setSettingsOpen(true)} palette={palette} />
        </View>
        <View style={styles.selectorSection}><Text style={[styles.sectionLabel, { color: palette.muted }]}>CURRENT DHIKR</Text>
          <Pressable testID="dhikr-selector" accessibilityRole="button" accessibilityLabel={'Select Dhikr, currently ' + selectedDhikr.name} onPress={() => setSelectorOpen(true)} style={({ pressed: selectorPressed }) => [styles.selector, { backgroundColor: palette.card, borderColor: palette.border, transform: [{ scale: selectorPressed ? 0.985 : 1 }] }]}>
            <View style={[styles.dhikrIcon, { backgroundColor: palette.green }]}><MaterialCommunityIcons name={selectedDhikr.icon} size={22} color={palette.primaryBright} /></View>
            <View style={styles.selectorCopy}><Text style={[styles.selectorName, { color: palette.foreground }]}>{selectedDhikr.name}</Text><Text style={[styles.arabic, { color: palette.muted }]}>{selectedDhikr.arabic}</Text></View>
            <View style={[styles.chevronCircle, { backgroundColor: palette.surface }]}><Feather name="chevron-down" size={18} color={palette.primaryBright} /></View>
          </Pressable>
        </View>
        <View style={[styles.device, { backgroundColor: palette.card, borderColor: palette.border, shadowColor: palette.shadow }]}>
          <View style={[styles.deviceRim, { borderColor: palette.primary }]}>
            <View style={[styles.lcd, { backgroundColor: palette.lcdDark, borderColor: palette.greenSoft }]}>
              <View style={styles.lcdTopLine}><Text style={[styles.lcdTitle, { color: palette.lcd }]}>TASBEEH COUNTER</Text><View style={styles.battery}><View style={[styles.batteryBody, { borderColor: palette.lcd }]}><View style={[styles.batteryLevel, { backgroundColor: palette.lcd }]} /></View><View style={[styles.batteryCap, { backgroundColor: palette.lcd }]} /></View></View>
              <Text style={[styles.lcdCaption, { color: palette.lcd }]}>COUNT</Text>
              <Animated.Text style={[styles.lcdDigits, { color: palette.lcd, transform: [{ scale: countScale }] }]}>{String(currentCount).padStart(6, '0')}</Animated.Text>
              <View style={[styles.lcdLine, { backgroundColor: palette.lcd }]} />
            </View>
            <View style={styles.buttonWell}><Pressable testID="tasbeeh-button" accessibilityRole="button" accessibilityLabel={'Increment ' + selectedDhikr.name + ' count'} accessibilityHint="Adds one repetition to the current Dhikr" onPress={increment} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} style={({ pressed: nativePressed }) => [styles.tasbeehButton, { backgroundColor: palette.primary, shadowColor: palette.shadow }, (pressed || nativePressed) && styles.tasbeehButtonPressed]}><View style={[styles.buttonHighlight, { backgroundColor: palette.primaryBright }]} /><Text style={[styles.tapLabel, { color: palette.primaryForeground }]}>TAP</Text><MaterialCommunityIcons name="fingerprint" size={30} color={palette.primaryForeground} /></Pressable></View>
          </View>
          <View style={styles.deviceBase}><View style={[styles.deviceScrew, { backgroundColor: palette.surfaceStrong }]} /><Text style={[styles.deviceHint, { color: palette.muted }]}>TAP TO COUNT</Text><View style={[styles.deviceScrew, { backgroundColor: palette.surfaceStrong }]} /></View>
        </View>
        <Pressable testID="reset-counter" accessibilityRole="button" accessibilityLabel={'Reset ' + selectedDhikr.name + ' counter'} onPress={() => setResetting(true)} style={({ pressed: resetPressed }) => [styles.resetButton, resetPressed && styles.resetPressed]}><Feather name="rotate-ccw" size={14} color={palette.primaryBright} /><Text style={[styles.resetText, { color: palette.primaryBright }]}>RESET CURRENT</Text></Pressable>
        <View style={[styles.preferenceCard, { backgroundColor: palette.card, borderColor: palette.border }]}><SettingRow icon="vibrate" label="Vibration" value={appState.vibration} onValueChange={(value) => changeSetting('vibration', value)} palette={palette} /><View style={[styles.rowDivider, { backgroundColor: palette.border }]} /><SettingRow icon="volume-2" label="Sound" value={appState.sound} onValueChange={(value) => changeSetting('sound', value)} palette={palette} feather /></View>
        <View style={[styles.tipCard, { backgroundColor: palette.green, borderColor: palette.greenSoft }]}><View style={[styles.tipIcon, { backgroundColor: palette.primary }]}><Feather name="sun" size={17} color={palette.primaryForeground} /></View><View style={styles.tipCopy}><Text style={[styles.tipHeading, { color: palette.primaryBright }]}>A gentle reminder</Text><Text style={[styles.tipBody, { color: palette.foreground }]}>Every Dhikr brings you closer to Allah.</Text></View><Feather name="chevron-right" size={18} color={palette.primaryBright} /></View>
        <Text style={[styles.offlineNote, { color: palette.muted }]}>Your count is saved on this device</Text>
      </ScrollView>

      <Modal visible={selectorOpen} transparent animationType="slide" onRequestClose={() => setSelectorOpen(false)}><View style={styles.modalRoot}><Pressable style={styles.modalBackdrop} onPress={() => setSelectorOpen(false)} /><View style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: Math.max(insets.bottom, 18) + 10 }]}><SheetHandle palette={palette} /><View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: palette.foreground }]}>Choose Dhikr</Text><Text style={[styles.sheetSubtitle, { color: palette.muted }]}>Each remembrance keeps its own count</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close Dhikr selector" onPress={() => setSelectorOpen(false)} style={[styles.closeButton, { backgroundColor: palette.surface }]}><Feather name="x" size={19} color={palette.foreground} /></Pressable></View>{DEFAULT_DHIKR.map((item, index) => { const active = item.id === selectedDhikr.id; return <Pressable key={item.id} testID={'dhikr-option-' + item.id} accessibilityRole="button" accessibilityLabel={'Select ' + item.name} onPress={() => chooseDhikr(item.id)} style={({ pressed: optionPressed }) => [styles.option, { backgroundColor: active ? palette.green : palette.surface, borderColor: active ? palette.primary : palette.border, opacity: optionPressed ? 0.8 : 1 }]}><View style={[styles.optionIcon, { backgroundColor: active ? palette.primary : palette.green }]}><MaterialCommunityIcons name={item.icon} size={19} color={active ? palette.primaryForeground : palette.primaryBright} /></View><View style={styles.optionCopy}><Text style={[styles.optionName, { color: palette.foreground }]}>{item.name}</Text><Text style={[styles.optionArabic, { color: palette.muted }]}>{item.arabic}</Text></View><View style={styles.optionMeta}><Text style={[styles.optionCount, { color: active ? palette.primaryBright : palette.muted }]}>{String(appState.counters[item.id] ?? 0).padStart(3, '0')}</Text>{active ? <Feather name="check" size={18} color={palette.primaryBright} /> : <Text style={[styles.optionNumber, { color: palette.muted }]}>{String(index + 1).padStart(2, '0')}</Text>}</View></Pressable>; })}</View></View></Modal>

      <Modal visible={settingsOpen} animationType="slide" onRequestClose={() => setSettingsOpen(false)}><View style={[styles.settingsRoot, { backgroundColor: palette.background, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 18) }]}><View style={styles.settingsHeader}><View><Text style={[styles.sheetTitle, { color: palette.foreground }]}>Settings</Text><Text style={[styles.sheetSubtitle, { color: palette.muted }]}>Make the practice feel like yours</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close settings" onPress={() => setSettingsOpen(false)} style={[styles.closeButton, { backgroundColor: palette.surface }]}><Feather name="x" size={19} color={palette.foreground} /></Pressable></View><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsScroll}><SettingsSection title="COUNTER" palette={palette}><SettingRow icon="vibrate" label="Vibration" value={appState.vibration} onValueChange={(value) => changeSetting('vibration', value)} palette={palette} /><SettingDivider palette={palette} /><SettingRow icon="volume-2" label="Sound" value={appState.sound} onValueChange={(value) => changeSetting('sound', value)} palette={palette} feather /><SettingDivider palette={palette} /><SettingRow icon="activity" label="Counter animation" value={appState.counterAnimation} onValueChange={(value) => changeSetting('counterAnimation', value)} palette={palette} feather /><SettingDivider palette={palette} /><SettingRow icon="save" label="Auto-save" value={appState.autoSave} onValueChange={(value) => changeSetting('autoSave', value)} palette={palette} feather /></SettingsSection><SettingsSection title="APPEARANCE" palette={palette}><View style={styles.themeRow}><View style={[styles.settingIcon, { backgroundColor: palette.green }]}><Feather name="moon" size={17} color={palette.primaryBright} /></View><Text style={[styles.settingLabel, { color: palette.foreground }]}>Theme</Text><View style={[styles.segmented, { backgroundColor: palette.surface }]}>{(['dark', 'light'] as const).map((theme) => <Pressable key={theme} onPress={() => changeSetting('theme', theme)} style={[styles.segment, appState.theme === theme && { backgroundColor: palette.primary }]}><Feather name={theme === 'dark' ? 'moon' : 'sun'} size={14} color={appState.theme === theme ? palette.primaryForeground : palette.muted} /><Text style={[styles.segmentText, { color: appState.theme === theme ? palette.primaryForeground : palette.muted }]}>{theme === 'dark' ? 'Dark' : 'Light'}</Text></Pressable>)}</View></View><SettingDivider palette={palette} /><View style={styles.settingInfoRow}><View style={[styles.settingIcon, { backgroundColor: palette.green }]}><Feather name="type" size={17} color={palette.primaryBright} /></View><View><Text style={[styles.settingLabel, { color: palette.foreground }]}>Counter size</Text><Text style={[styles.settingHint, { color: palette.muted }]}>Large and easy to read</Text></View></View></SettingsSection><SettingsSection title="ABOUT" palette={palette}><View style={styles.aboutRow}><View style={[styles.aboutMark, { backgroundColor: palette.green }]}><MaterialCommunityIcons name="counter" size={21} color={palette.primaryBright} /></View><View style={styles.aboutCopy}><Text style={[styles.aboutTitle, { color: palette.foreground }]}>Tasbeeh Counter</Text><Text style={[styles.aboutBody, { color: palette.muted }]}>A quiet place to remember.</Text></View><Text style={[styles.version, { color: palette.muted }]}>v1.0</Text></View></SettingsSection></ScrollView></View></Modal>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}><View style={styles.menuRoot}><Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)} /><View style={[styles.menuCard, { backgroundColor: palette.card, borderColor: palette.border, marginTop: insets.top + 70 }]}><View style={styles.menuBrandRow}><View style={[styles.menuMark, { backgroundColor: palette.green }]}><MaterialCommunityIcons name="counter" size={20} color={palette.primaryBright} /></View><View><Text style={[styles.menuTitle, { color: palette.foreground }]}>Tasbeeh Counter</Text><Text style={[styles.menuSubtitle, { color: palette.muted }]}>A mindful moment, one tap at a time</Text></View></View><Pressable accessibilityRole="button" accessibilityLabel="Open settings from menu" onPress={() => { setMenuOpen(false); setSettingsOpen(true); }} style={({ pressed: menuPressed }) => [styles.menuAction, { backgroundColor: palette.surface, opacity: menuPressed ? 0.75 : 1 }]}><Feather name="settings" size={18} color={palette.primaryBright} /><Text style={[styles.menuActionText, { color: palette.foreground }]}>Settings</Text><Feather name="chevron-right" size={17} color={palette.muted} /></Pressable></View></View></Modal>

      <Modal visible={resetting} transparent animationType="fade" onRequestClose={() => setResetting(false)}><View style={styles.confirmRoot}><Pressable style={styles.modalBackdrop} onPress={() => setResetting(false)} /><View style={[styles.confirmCard, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={[styles.confirmIcon, { backgroundColor: palette.green }]}><Feather name="rotate-ccw" size={22} color={palette.primaryBright} /></View><Text style={[styles.confirmTitle, { color: palette.foreground }]}>Reset Counter?</Text><Text style={[styles.confirmBody, { color: palette.muted }]}>This will reset the {selectedDhikr.name} count to 0.</Text><View style={styles.confirmActions}><Pressable accessibilityRole="button" accessibilityLabel="Cancel reset" onPress={() => setResetting(false)} style={[styles.confirmButton, { backgroundColor: palette.surface }]}><Text style={[styles.confirmButtonText, { color: palette.foreground }]}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Confirm reset" onPress={resetCurrent} style={[styles.confirmButton, { backgroundColor: palette.primary }]}><Text style={[styles.confirmButtonText, { color: palette.primaryForeground }]}>Reset</Text></Pressable></View></View></View></Modal>
    </View>
  );
}

type Palette = typeof colors.dark | typeof colors.light;
function IconButton({ icon, label, onPress, palette }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; palette: Palette }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, { backgroundColor: palette.card, borderColor: palette.border, opacity: pressed ? 0.72 : 1 }]}><Feather name={icon} size={19} color={palette.primaryBright} /></Pressable>; }
function SettingRow({ icon, label, value, onValueChange, palette, feather = false }: { icon: string; label: string; value: boolean; onValueChange: (value: boolean) => void; palette: Palette; feather?: boolean }) { return <View style={styles.settingRow}><View style={[styles.settingIcon, { backgroundColor: palette.green }]}>{feather ? <Feather name={icon as keyof typeof Feather.glyphMap} size={17} color={palette.primaryBright} /> : <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color={palette.primaryBright} />}</View><Text style={[styles.settingLabel, { color: palette.foreground }]}>{label}</Text><Switch testID={'toggle-' + label.toLowerCase().replace(' ', '-')} accessibilityLabel={'Toggle ' + label} value={value} onValueChange={onValueChange} trackColor={{ false: palette.surfaceStrong, true: palette.greenSoft }} thumbColor={value ? palette.primaryBright : palette.muted} ios_backgroundColor={palette.surfaceStrong} /></View>; }
function SettingDivider({ palette }: { palette: Palette }) { return <View style={[styles.settingDivider, { backgroundColor: palette.border }]} />; }
function SettingsSection({ title, children, palette }: { title: string; children: React.ReactNode; palette: Palette }) { return <View style={styles.settingsSection}><Text style={[styles.sectionLabel, { color: palette.primaryBright }]}>{title}</Text><View style={[styles.settingsGroup, { backgroundColor: palette.card, borderColor: palette.border }]}>{children}</View></View>; }
function SheetHandle({ palette }: { palette: Palette }) { return <View style={[styles.sheetHandle, { backgroundColor: palette.surfaceStrong }]} />; }

const styles = StyleSheet.create({
  root: { flex: 1 }, scrollContent: { paddingHorizontal: 20 }, topBar: { minHeight: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 46, height: 46, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 }, greeting: { alignItems: 'center', gap: 2 }, eyebrow: { fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 1.5 }, greetingName: { fontFamily: 'Inter_700Bold', fontSize: 23, letterSpacing: -0.4 }, selectorSection: { marginTop: 10, marginBottom: 17 }, sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 9 }, selector: { minHeight: 78, borderRadius: 24, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 3 }, dhikrIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, selectorCopy: { flex: 1, paddingLeft: 13 }, selectorName: { fontFamily: 'Inter_600SemiBold', fontSize: 16, marginBottom: 5 }, arabic: { fontFamily: 'Inter_400Regular', fontSize: 13 }, chevronCircle: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  device: { borderRadius: 35, borderWidth: 1, padding: 12, shadowOpacity: 0.46, shadowRadius: 24, shadowOffset: { width: 0, height: 17 }, elevation: 12 }, deviceRim: { borderRadius: 27, borderWidth: 1.5, padding: 10 }, lcd: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 17, paddingTop: 15, paddingBottom: 13, minHeight: 138, justifyContent: 'space-between' }, lcdTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, lcdTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 3.2 }, lcdCaption: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 2, marginTop: 15 }, lcdDigits: { fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' }), fontSize: 41, fontWeight: '700', letterSpacing: 3, lineHeight: 49 }, lcdLine: { height: 1, opacity: 0.34, marginTop: 5 }, battery: { flexDirection: 'row', alignItems: 'center', gap: 2 }, batteryBody: { width: 20, height: 9, borderWidth: 1, borderRadius: 2, padding: 1 }, batteryLevel: { flex: 1, borderRadius: 1 }, batteryCap: { width: 2, height: 4, borderRadius: 1 }, buttonWell: { alignItems: 'center', justifyContent: 'center', paddingVertical: 22 }, tasbeehButton: { width: 178, height: 178, borderRadius: 89, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.36, shadowRadius: 16, shadowOffset: { width: 0, height: 12 }, elevation: 10 }, tasbeehButtonPressed: { transform: [{ translateY: 5 }, { scale: 0.975 }], shadowOpacity: 0.18, shadowOffset: { width: 0, height: 5 } }, buttonHighlight: { position: 'absolute', top: 13, left: 27, right: 27, height: 35, borderRadius: 30, opacity: 0.23 }, tapLabel: { fontFamily: 'Inter_700Bold', fontSize: 15, letterSpacing: 3, marginBottom: 7 }, deviceBase: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 4 }, deviceScrew: { width: 7, height: 7, borderRadius: 4 }, deviceHint: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 2.8 }, resetButton: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 13, paddingHorizontal: 16, marginTop: 7 }, resetPressed: { opacity: 0.58, transform: [{ scale: 0.97 }] }, resetText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.6 }, preferenceCard: { borderRadius: 23, borderWidth: 1, paddingHorizontal: 15, marginTop: 10 }, settingRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, settingLabel: { fontFamily: 'Inter_500Medium', fontSize: 15, flex: 1 }, rowDivider: { height: 1, marginLeft: 48 }, tipCard: { minHeight: 78, borderRadius: 23, borderWidth: 1, padding: 14, marginTop: 14, flexDirection: 'row', alignItems: 'center' }, tipIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, tipCopy: { flex: 1, paddingHorizontal: 12 }, tipHeading: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1, marginBottom: 5 }, tipBody: { fontFamily: 'Inter_500Medium', fontSize: 13 }, offlineNote: { fontFamily: 'Inter_400Regular', textAlign: 'center', fontSize: 11, marginTop: 17 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' }, modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.66)' }, sheet: { borderTopLeftRadius: 31, borderTopRightRadius: 31, borderWidth: 1, padding: 20, paddingTop: 12 }, sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 19 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, sheetTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 }, sheetSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }, closeButton: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, option: { minHeight: 62, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginTop: 9 }, optionIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, optionCopy: { flex: 1, paddingLeft: 11 }, optionName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 }, optionArabic: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, optionMeta: { alignItems: 'flex-end', gap: 5, paddingLeft: 8 }, optionCount: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 1 }, optionNumber: { fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 1 },
  settingsRoot: { flex: 1, paddingHorizontal: 20 }, settingsHeader: { minHeight: 73, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, settingsScroll: { paddingTop: 14, paddingBottom: 30 }, settingsSection: { marginBottom: 22 }, settingsGroup: { borderRadius: 23, borderWidth: 1, paddingHorizontal: 15 }, settingDivider: { height: 1, marginLeft: 48 }, themeRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12 }, segmented: { flexDirection: 'row', borderRadius: 13, padding: 3, gap: 2 }, segment: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10 }, segmentText: { fontFamily: 'Inter_500Medium', fontSize: 11 }, settingInfoRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingHint: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, aboutRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center' }, aboutMark: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, aboutCopy: { flex: 1, paddingLeft: 12 }, aboutTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 }, aboutBody: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }, version: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  menuRoot: { flex: 1 }, menuCard: { marginHorizontal: 16, borderRadius: 24, borderWidth: 1, padding: 14, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 }, menuBrandRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 13 }, menuMark: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 11 }, menuTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 }, menuSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }, menuAction: { minHeight: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12 }, menuActionText: { fontFamily: 'Inter_500Medium', fontSize: 14, flex: 1 }, confirmRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 }, confirmCard: { width: '100%', borderRadius: 27, borderWidth: 1, padding: 22, alignItems: 'center' }, confirmIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 15 }, confirmTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 }, confirmBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 250 }, confirmActions: { width: '100%', flexDirection: 'row', gap: 9, marginTop: 22 }, confirmButton: { flex: 1, minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, confirmButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});

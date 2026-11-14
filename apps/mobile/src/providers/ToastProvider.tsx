import { MaterialIcons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, shadow } from '@/theme';

type Tone = 'success' | 'danger' | 'warning' | 'info';
interface Toast {
  id: number;
  title: string;
  message?: string;
  tone: Tone;
}

const ToastContext = createContext<{ show: (t: Omit<Toast, 'id'>) => void } | null>(null);

const TONE: Record<Tone, { icon: keyof typeof MaterialIcons.glyphMap; color: string; bg: string }> = {
  success: { icon: 'check-circle', color: colors.success, bg: colors.successSoft },
  danger: { icon: 'error', color: colors.danger, bg: colors.dangerSoft },
  warning: { icon: 'warning', color: colors.warning, bg: colors.warningSoft },
  info: { icon: 'info', color: colors.primary, bg: colors.primarySoft },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 12 }]}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  const tone = TONE[toast.tone];
  return (
    <Animated.View
      style={[styles.toast, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}
      accessibilityRole="alert"
    >
      <View style={[styles.iconWrap, { backgroundColor: tone.bg }]}>
        <MaterialIcons name={tone.icon} size={18} color={tone.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={2}>
          {toast.title}
        </Text>
        {toast.message ? (
          <Text style={styles.message} numberOfLines={3}>
            {toast.message}
          </Text>
        ) : null}
      </View>
      <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Dismiss notification">
        <MaterialIcons name="close" size={18} color={colors.textSubtle} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 8, paddingHorizontal: 16, zIndex: 1000 },
  toast: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    ...shadow,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.semibold, fontSize: 14, color: colors.text },
  message: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: 2 },
});

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

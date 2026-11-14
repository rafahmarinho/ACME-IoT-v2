import { router } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/lib/api';
import { colors, font, radius, type } from '@/theme';
import { Button, Icon, IconButton, type IconName } from './primitives';

export const WIDE = 960;
export function useIsWide() {
  return useWindowDimensions().width >= WIDE;
}

/** Scrollable page container with pull-to-refresh and keyboard avoidance. */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  maxWidth = 1180,
  contentStyle,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  maxWidth?: number;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  const pad = wide ? 32 : 16;
  const inner = <View style={[{ width: '100%', maxWidth, alignSelf: 'center', gap: 16 }, contentStyle]}>{children}</View>;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ padding: pad, paddingTop: wide ? 28 : 12, paddingBottom: insets.bottom + 96 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, padding: pad }}>{inner}</View>
      )}
    </KeyboardAvoidingView>
  );
}

export function PageHeader({ title, subtitle, back, actions }: { title: string; subtitle?: string; back?: boolean | string; actions?: ReactNode }) {
  const wide = useIsWide();
  return (
    <View style={[styles.header, !wide && { flexWrap: 'wrap' }]}>
      {back ? (
        <IconButton
          icon="arrow-back"
          label="Go back"
          color={colors.text}
          onPress={() => (router.canGoBack() ? router.back() : router.replace(typeof back === 'string' ? (back as any) : '/'))}
        />
      ) : null}
      <View style={{ flex: 1, minWidth: 180 }}>
        <Text style={[type.h1, !wide && { fontSize: 22, lineHeight: 28 }]} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={[type.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {actions ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</View> : null}
    </View>
  );
}

export function EmptyState({ icon = 'inbox', title, message, action }: { icon?: IconName; title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={[type.h3, { textAlign: 'center' }]}>{title}</Text>
      {message ? <Text style={[type.small, { textAlign: 'center', maxWidth: 360 }]}>{message}</Text> : null}
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <View style={[styles.empty, { borderColor: '#F5C2C2', backgroundColor: '#FFFBFB' }]} accessibilityRole="alert">
      <View style={[styles.emptyIcon, { backgroundColor: colors.dangerSoft }]}>
        <Icon name="error-outline" size={28} color={colors.danger} />
      </View>
      <Text style={[type.h3, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.small, { textAlign: 'center', maxWidth: 420 }]}>{errorMessage(error)}</Text>
      {onRetry ? <Button title="Try again" icon="refresh" variant="secondary" onPress={onRetry} size="sm" /> : null}
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ height, width, borderRadius: 8, backgroundColor: colors.border, opacity }, style]} />;
}

export function SkeletonCards({ count = 6, height = 132 }: { count?: number; height?: number }) {
  return (
    <View style={styles.grid} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.gridItem, styles.skelCard, { height }]}>
          <Skeleton width={120} height={14} />
          <Skeleton width={80} height={28} style={{ marginTop: 16 }} />
          <Skeleton width={'60%'} height={12} style={{ marginTop: 12 }} />
        </View>
      ))}
    </View>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={{ padding: 40, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator color={colors.primary} />
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

/** Responsive grid: 1 column on phones, up to `columns` on wide screens. */
export function Grid({ children, min = 280 }: { children: ReactNode; min?: number }) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const available = Math.min(width - (wide ? 240 + 64 : 32), 1180);
  const cols = Math.max(1, Math.floor(available / min));
  const items = (Array.isArray(children) ? children.flat(3) : [children]).filter(Boolean);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={{ gap: 16 }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 16 }}>
          {row.map((child, i) => (
            <View key={(child as any)?.key ?? i} style={{ flex: 1, minWidth: 0 }}>
              {child}
            </View>
          ))}
          {Array.from({ length: cols - row.length }).map((_, i) => (
            <View key={`pad-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function ProgressBar({ value, tone = colors.primary, height = 8 }: { value: number; tone?: string; height?: number }) {
  return (
    <View
      style={{ height, borderRadius: height, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
    >
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', backgroundColor: tone, borderRadius: height }} />
    </View>
  );
}

export function Banner({ tone = 'warning', icon, title, message, action }: { tone?: 'warning' | 'danger' | 'info' | 'success'; icon?: IconName; title: string; message?: string; action?: ReactNode }) {
  const map = {
    warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'warning' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'error' },
    info: { bg: colors.primarySoft, fg: colors.primary, icon: 'info' },
    success: { bg: colors.successSoft, fg: colors.success, icon: 'check-circle' },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: map.bg }]} accessibilityRole="alert">
      <Icon name={icon ?? map.icon} size={20} color={map.fg} />
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontFamily: font.semibold, color: colors.text, fontSize: 14 }]}>{title}</Text>
        {message ? <Text style={[type.small, { color: colors.textMuted }]}>{message}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive,
  loading,
  onConfirm,
  onCancel,
  children,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.dialogBackdrop} onPress={onCancel}>
        <Pressable style={styles.dialog} onPress={() => undefined} accessibilityViewIsModal>
          <Text style={type.h2}>{title}</Text>
          {message ? <Text style={[type.body, { color: colors.textMuted }]}>{message}</Text> : null}
          {children}
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button title="Cancel" variant="secondary" onPress={onCancel} />
            <Button title={confirmLabel} variant={destructive ? 'danger' : 'primary'} onPress={onConfirm} loading={loading} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Centered modal sheet used for forms. */
export function FormSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[styles.dialogBackdrop, { justifyContent: 'flex-end' }]} onPress={onClose}>
          <Pressable style={[styles.formSheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[type.h2, { flex: 1 }]}>{title}</Text>
              <IconButton icon="close" label="Close" onPress={onClose} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function KeyValue({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text style={[type.small, { flex: 1 }]}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[type.body, { fontFamily: mono ? Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) : font.medium, fontSize: 14, textAlign: 'right', flexShrink: 1 }]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 36,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridItem: { width: '100%', maxWidth: 360, flexGrow: 1 },
  skelCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md },
  dialogBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 20, gap: 12 },
  formSheet: { width: '100%', maxWidth: 620, maxHeight: '92%', backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20 },
  kv: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});

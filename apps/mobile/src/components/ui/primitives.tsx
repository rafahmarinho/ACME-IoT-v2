import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { initials } from '@/lib/format';
import { colors, font, radius, shadow, type } from '@/theme';

export type IconName = keyof typeof MaterialIcons.glyphMap;

export function Icon({ name, size = 20, color = colors.textMuted }: { name: IconName | string; size?: number; color?: string }) {
  return <MaterialIcons name={name as IconName} size={size} color={color} />;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  size = 'md',
  style,
  accessibilityHint,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;
  const height = size === 'sm' ? 36 : size === 'lg' ? 52 : 44;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      style={({ pressed, hovered }: any) => [
        styles.button,
        { height, paddingHorizontal: size === 'sm' ? 12 : 16, backgroundColor: v.bg, borderColor: v.border },
        (pressed || hovered) && !isDisabled && { backgroundColor: v.pressed },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={v.fg} /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={v.fg} /> : null}
      <Text style={[styles.buttonText, { color: v.fg, fontSize: size === 'sm' ? 13 : 15 }]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string; pressed: string }> = {
  primary: { bg: colors.primary, fg: '#fff', border: colors.primary, pressed: colors.primaryDark },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.borderStrong, pressed: colors.surfaceAlt },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent', pressed: colors.primarySoft },
  danger: { bg: colors.surface, fg: colors.danger, border: '#F5C2C2', pressed: colors.dangerSoft },
  subtle: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft, pressed: '#E0E3FF' },
};

export function IconButton({
  icon,
  onPress,
  label,
  color = colors.textMuted,
  size = 40,
  badge,
  disabled,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  color?: string;
  size?: number;
  badge?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed, hovered }: any) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
        (pressed || hovered) && { backgroundColor: colors.surfaceAlt },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Icon name={icon} size={22} color={color} />
      {badge ? (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeDotText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Card({ children, style, onPress, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean }) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed, hovered }: any) => [styles.card, padded && styles.cardPad, hovered && styles.cardHover, pressed && { opacity: 0.92 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, padded && styles.cardPad, style]}>{children}</View>;
}

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
  primary: { bg: colors.primarySoft, fg: colors.primary },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
};

export function Badge({ label, tone = 'neutral', icon, dot }: { label: string; tone?: Tone; icon?: IconName; dot?: boolean }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: t.fg }]} /> : null}
      {icon ? <Icon name={icon} size={12} color={t.fg} /> : null}
      <Text style={[styles.badgeText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function StatusDot({ online }: { online: boolean }) {
  return <View style={[styles.statusDot, { backgroundColor: online ? colors.success : colors.danger }]} />;
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.semibold, color: colors.primary, fontSize: size * 0.38 }}>{initials(name || '?')}</Text>
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, style]} />;
}

export function SectionTitle({ title, action, subtitle }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={{ flex: 1 }}>
        <Text style={type.h3}>{title}</Text>
        {subtitle ? <Text style={[type.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Row({ children, gap = 8, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function ListItem({
  title,
  subtitle,
  left,
  right,
  onPress,
  chevron,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const content = (
    <>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.body, { fontFamily: font.medium }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={type.small} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-right" size={20} color={colors.textSubtle} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.listItem}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed, hovered }: any) => [styles.listItem, (pressed || hovered) && { backgroundColor: colors.surfaceAlt }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transitionDuration: '120ms' } as object) : {}),
  },
  buttonText: { fontFamily: font.semibold },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow },
  cardPad: { padding: 16 },
  cardHover: { borderColor: colors.primaryBorder },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontFamily: font.semibold, fontSize: 11.5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  badgeDot: {
    position: 'absolute',
    top: 4,
    right: 3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeDotText: { color: '#fff', fontFamily: font.bold, fontSize: 9 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.md, minHeight: 56 },
});

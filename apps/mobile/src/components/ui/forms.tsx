import { useState, type ReactNode } from 'react';
import { FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, type } from '@/theme';
import { Icon, type IconName } from './primitives';

export function TextField({
  label,
  error,
  hint,
  icon,
  right,
  ...props
}: TextInputProps & { label?: string; error?: string | null; hint?: string; icon?: IconName; right?: ReactNode }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={type.label}>{label}</Text> : null}
      <View style={[styles.field, focused && styles.fieldFocused, !!error && styles.fieldError, props.editable === false && { backgroundColor: colors.surfaceAlt }]}>
        {icon ? <Icon name={icon} size={18} color={colors.textSubtle} /> : null}
        <TextInput
          placeholderTextColor={colors.textSubtle}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[styles.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object), props.style]}
          accessibilityLabel={props.accessibilityLabel ?? label}
        />
        {right}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={type.small}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function PasswordField(props: TextInputProps & { label?: string; error?: string | null; hint?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      icon="lock-outline"
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      right={
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={10} accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
          <Icon name={visible ? 'visibility-off' : 'visibility'} size={18} color={colors.textSubtle} />
        </Pressable>
      }
    />
  );
}

export function SearchBar({ value, onChangeText, placeholder = 'Search' }: { value: string; onChangeText: (v: string) => void; placeholder?: string }) {
  return (
    <View style={[styles.field, { height: 44 }]}>
      <Icon name="search" size={20} color={colors.textSubtle} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        style={[styles.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Clear search">
          <Icon name="cancel" size={18} color={colors.textSubtle} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && { color: colors.primary }]}>{o.label}</Text>
            {o.count !== undefined ? <Text style={[styles.chipCount, active && { color: colors.primary }]}>{o.count}</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Segmented<T extends string>({ options, value, onChange, disabled }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <View style={[styles.segmented, disabled && { opacity: 0.5 }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && { color: colors.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleRow({ label, description, value, onValueChange, disabled }: { label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontFamily: font.medium }]}>{label}</Text>
        {description ? <Text style={type.small}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.borderStrong }}
        thumbColor="#fff"
        accessibilityLabel={label}
        {...(Platform.OS === 'web' ? ({ activeThumbColor: '#fff' } as object) : {})}
      />
    </View>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: IconName;
}

/** Touch-friendly picker that opens a bottom sheet with searchable options. */
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  error,
  disabled,
}: {
  label?: string;
  value: string | null | undefined;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const insets = useSafeAreaInsets();
  const selected = options.find((o) => o.value === value);
  const filtered = q ? options.filter((o) => `${o.label} ${o.description ?? ''}`.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={type.label}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${selected?.label ?? placeholder}` : selected?.label ?? placeholder}
        style={[styles.field, !!error && styles.fieldError, disabled && { opacity: 0.6 }]}
      >
        {selected?.icon ? <Icon name={selected.icon} size={18} color={colors.primary} /> : null}
        <Text style={[styles.input, { paddingVertical: 0 }, !selected && { color: colors.textSubtle }]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Icon name="expand-more" size={20} color={colors.textSubtle} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close">
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => undefined}>
            <View style={styles.sheetHandle} />
            <Text style={[type.h3, { marginBottom: 12 }]}>{label ?? 'Select'}</Text>
            {options.length > 7 ? (
              <View style={{ marginBottom: 8 }}>
                <SearchBar value={q} onChangeText={setQ} placeholder="Filter options" />
              </View>
            ) : null}
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.value}
              style={{ maxHeight: 420 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                      setQ('');
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [styles.option, (pressed || active) && { backgroundColor: colors.primarySoft }]}
                  >
                    {item.icon ? <Icon name={item.icon} size={20} color={active ? colors.primary : colors.textMuted} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, active && { color: colors.primary, fontFamily: font.semibold }]}>{item.label}</Text>
                      {item.description ? <Text style={type.small}>{item.description}</Text> : null}
                    </View>
                    {active ? <Icon name="check" size={20} color={colors.primary} /> : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={[type.small, { padding: 12 }]}>No matches.</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Large +/- control, comfortable for touch. */
export function Stepper({ value, onChange, step = 0.5, min, max, format, disabled }: { value: number; onChange: (v: number) => void; step?: number; min: number; max: number; format: (v: number) => string; disabled?: boolean }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 10) / 10)));
  return (
    <View style={[styles.stepper, disabled && { opacity: 0.5 }]}>
      <Pressable disabled={disabled || value <= min} onPress={() => set(value - step)} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel="Decrease">
        <Icon name="remove" size={26} color={colors.primary} />
      </Pressable>
      <Text style={styles.stepValue} accessibilityLiveRegion="polite">
        {format(value)}
      </Text>
      <Pressable disabled={disabled || value >= max} onPress={() => set(value + step)} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel="Increase">
        <Icon name="add" size={26} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  fieldFocused: { borderColor: colors.primary, ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 3px rgba(79,70,229,0.15)' } as object) : {}) },
  fieldError: { borderColor: colors.danger },
  input: { flex: 1, fontFamily: font.regular, fontSize: 16, color: colors.text, paddingVertical: 12 },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  chipText: { fontFamily: font.medium, fontSize: 13.5, color: colors.textMuted },
  chipCount: { fontFamily: font.semibold, fontSize: 12, color: colors.textSubtle },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3, gap: 2 },
  segment: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.surface, ...(Platform.OS === 'web' ? ({ boxShadow: '0 1px 3px rgba(15,23,42,0.12)' } as object) : { elevation: 1 }) },
  segmentText: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12, minHeight: 56 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 52, borderRadius: radius.md },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontFamily: font.bold, fontSize: 34, color: colors.text, minWidth: 120, textAlign: 'center', letterSpacing: -1 },
});

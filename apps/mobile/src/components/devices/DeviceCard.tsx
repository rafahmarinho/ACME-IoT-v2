import { StyleSheet, Text, View } from 'react-native';
import { DEVICE_ICON, DEVICE_LABEL, formatTemp, pendingKeys, primaryReading, timeAgo } from '@/lib/format';
import { colors, font, radius, type } from '@/theme';
import type { Device, DeviceType } from '@/types/db';
import { Badge, Card, Icon } from '../ui/primitives';

export const DEVICE_COLOR: Record<DeviceType, { fg: string; bg: string }> = {
  thermostat: { fg: '#4F46E5', bg: '#EEF0FF' },
  smart_plug: { fg: '#0D9488', bg: '#E6F6F4' },
  temperature_sensor: { fg: '#EA580C', bg: '#FFF1E8' },
  humidity_sensor: { fg: '#0284C7', bg: '#E6F4FB' },
  occupancy_sensor: { fg: '#9333EA', bg: '#F5ECFE' },
};

export function DeviceGlyph({ type: t, size = 40, dim }: { type: DeviceType; size?: number; dim?: boolean }) {
  const c = DEVICE_COLOR[t];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: dim ? colors.surfaceAlt : c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={DEVICE_ICON[t]} size={size * 0.52} color={dim ? colors.textSubtle : c.fg} />
    </View>
  );
}

export function BatteryIndicator({ level }: { level: number | null }) {
  if (level === null || level === undefined) return null;
  const tone = level < 15 ? colors.danger : level < 35 ? colors.warning : colors.success;
  const icon = level < 15 ? 'battery-alert' : level < 35 ? 'battery-3-bar' : level < 80 ? 'battery-5-bar' : 'battery-full';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} accessibilityLabel={`Battery ${level}%`}>
      <Icon name={icon} size={15} color={tone} />
      <Text style={{ fontFamily: font.semibold, fontSize: 12, color: tone }}>{level}%</Text>
    </View>
  );
}

export function StatusBadge({ device }: { device: Device }) {
  if (device.status === 'offline') return <Badge label="Offline" tone="danger" dot />;
  if (pendingKeys(device).length) return <Badge label="Syncing" tone="warning" icon="sync" />;
  return <Badge label="Online" tone="success" dot />;
}

export function DeviceCard({ device, roomName, onPress }: { device: Device; roomName?: string; onPress?: () => void }) {
  const r = primaryReading(device);
  const offline = device.status === 'offline';
  const st = device.reported_state ?? {};
  return (
    <Card onPress={onPress} style={[styles.card, offline && styles.offline]}>
      <View style={styles.top}>
        <DeviceGlyph type={device.type} dim={offline} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.body, { fontFamily: font.semibold }]} numberOfLines={1}>
            {device.name}
          </Text>
          <Text style={type.small} numberOfLines={1}>
            {roomName ?? DEVICE_LABEL[device.type]}
          </Text>
        </View>
        <StatusBadge device={device} />
      </View>
      <View style={styles.bottom}>
        <View>
          <Text style={[styles.value, offline && { color: colors.textSubtle }]}>{r.value}</Text>
          <Text style={type.small}>{offline ? `Last seen ${timeAgo(device.last_seen_at)}` : r.label}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {device.type === 'thermostat' && st.hvac && st.hvac !== 'idle' && !offline ? (
            <Badge label={st.hvac === 'heating' ? 'Heating' : 'Cooling'} tone={st.hvac === 'heating' ? 'warning' : 'info'} icon={st.hvac === 'heating' ? 'whatshot' : 'ac-unit'} />
          ) : null}
          {device.type === 'smart_plug' ? <Badge label={st.power ? 'ON' : 'OFF'} tone={st.power ? 'success' : 'neutral'} icon="power-settings-new" /> : null}
          {device.type === 'occupancy_sensor' ? <Text style={type.small}>{st.occupied ? 'people present' : 'no one'}</Text> : null}
          <BatteryIndicator level={device.battery_level} />
        </View>
      </View>
    </Card>
  );
}

/** Desired (requested) vs reported (device) state, key by key. */
export function StateComparison({ device }: { device: Device }) {
  const desired = device.desired_state ?? {};
  const reported = device.reported_state ?? {};
  const keys = Array.from(new Set([...Object.keys(desired), ...Object.keys(reported)])).filter((k) => !['energy_kwh'].includes(k));
  const fmt = (k: string, v: any) => {
    if (v === undefined || v === null) return '—';
    if (k === 'setpoint' || k === 'temperature') return formatTemp(v);
    if (k === 'humidity') return `${v}%`;
    if (k === 'watts') return `${v} W`;
    if (typeof v === 'boolean') return k === 'power' ? (v ? 'On' : 'Off') : v ? 'Yes' : 'No';
    return String(v);
  };
  const label: Record<string, string> = { setpoint: 'Setpoint', mode: 'Mode', temperature: 'Temperature', humidity: 'Humidity', hvac: 'HVAC', power: 'Power', watts: 'Load', occupied: 'Occupied', count: 'People' };
  return (
    <View style={styles.table}>
      <View style={[styles.tr, styles.th]}>
        <Text style={[type.caption, { flex: 1.2 }]}>Property</Text>
        <Text style={[type.caption, { flex: 1, textAlign: 'right' }]}>Desired</Text>
        <Text style={[type.caption, { flex: 1, textAlign: 'right' }]}>Reported</Text>
      </View>
      {keys.map((k) => {
        const hasDesired = k in desired;
        const mismatch = hasDesired && JSON.stringify(desired[k]) !== JSON.stringify(reported[k]);
        return (
          <View key={k} style={[styles.tr, mismatch && { backgroundColor: colors.warningSoft }]}>
            <Text style={[type.small, { flex: 1.2, color: colors.text }]}>{label[k] ?? k}</Text>
            <Text style={[styles.cell, !hasDesired && { color: colors.textSubtle }]}>{hasDesired ? fmt(k, desired[k]) : 'read-only'}</Text>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
              {mismatch ? <Icon name="sync" size={14} color={colors.warning} /> : hasDesired ? <Icon name="check" size={14} color={colors.success} /> : null}
              <Text style={[styles.cell, { flex: 0 }]}>{fmt(k, reported[k])}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, minHeight: 132 },
  offline: { borderColor: '#F5C2C2', backgroundColor: '#FFFCFC' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  value: { fontFamily: font.bold, fontSize: 26, color: colors.text, letterSpacing: -0.6 },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  th: { backgroundColor: colors.surfaceAlt, borderTopWidth: 0 },
  cell: { flex: 1, textAlign: 'right', fontFamily: font.semibold, fontSize: 13.5, color: colors.text },
});

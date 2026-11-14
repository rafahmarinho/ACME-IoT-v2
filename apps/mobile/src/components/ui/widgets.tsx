import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { formatDateTime, timeAgo } from '@/lib/format';
import { colors, font, type } from '@/theme';
import type { Alert, EventRow } from '@/types/db';
import { Badge, Card, Icon, type IconName } from './primitives';

export function StatTile({ icon, label, value, sub, tone = colors.primary, onPress }: { icon: IconName; label: string; value: string; sub?: string; tone?: string; onPress?: () => void }) {
  return (
    <Card onPress={onPress} style={{ gap: 10, minHeight: 116 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[styles.tileIcon, { backgroundColor: `${tone}18` }]}>
          <Icon name={icon} size={18} color={tone} />
        </View>
        <Text style={[type.label, { flex: 1 }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={type.metric} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={type.small} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </Card>
  );
}

export const SEVERITY_TONE = { critical: 'danger', warning: 'warning', info: 'info' } as const;
export const SEVERITY_ICON: Record<string, IconName> = { critical: 'error', warning: 'warning', info: 'info' };

export function AlertRow({ alert, deviceName, right }: { alert: Alert; deviceName?: string; right?: React.ReactNode }) {
  const color = alert.severity === 'critical' ? colors.danger : alert.severity === 'warning' ? colors.warning : colors.info;
  return (
    <View style={[styles.row, alert.status === 'resolved' && { opacity: 0.65 }]}>
      <Icon name={SEVERITY_ICON[alert.severity]} size={22} color={color} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[type.body, { fontFamily: font.semibold, fontSize: 14.5 }]} numberOfLines={2}>
          {alert.title}
        </Text>
        <Text style={type.small} numberOfLines={2}>
          {alert.message}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
          <Badge label={alert.status === 'open' ? 'Open' : alert.status === 'acknowledged' ? 'Acknowledged' : 'Resolved'} tone={alert.status === 'open' ? SEVERITY_TONE[alert.severity] : 'neutral'} />
          {deviceName ? (
            <Text style={[type.small, { color: colors.primary, fontFamily: font.medium }]} onPress={() => alert.device_id && router.push(`/devices/${alert.device_id}`)}>
              {deviceName}
            </Text>
          ) : null}
          <Text style={type.small}>· {timeAgo(alert.created_at)}</Text>
        </View>
      </View>
      {right}
    </View>
  );
}

const EVENT_ICON: Record<string, { icon: IconName; color: string }> = {
  device: { icon: 'developer-board', color: colors.primary },
  command: { icon: 'tune', color: '#0D9488' },
  automation: { icon: 'auto-mode', color: '#9333EA' },
  firmware: { icon: 'system-update-alt', color: '#0284C7' },
  simulation: { icon: 'science', color: '#EA580C' },
  gateway: { icon: 'router', color: colors.danger },
  integration: { icon: 'hub', color: '#475569' },
  team: { icon: 'group-add', color: '#475569' },
  user: { icon: 'person', color: '#475569' },
};

export function eventStyle(t: string) {
  const kind = t.split('.')[0];
  if (t.endsWith('offline') || t.endsWith('failed') || t.endsWith('down')) return { icon: (EVENT_ICON[kind]?.icon ?? 'error') as IconName, color: colors.danger };
  if (t.endsWith('battery_low')) return { icon: 'battery-alert' as IconName, color: colors.warning };
  if (t.endsWith('reconnected') || t.endsWith('succeeded')) return { icon: (EVENT_ICON[kind]?.icon ?? 'check') as IconName, color: colors.success };
  if (t.endsWith('rolled_back')) return { icon: 'history' as IconName, color: colors.warning };
  return EVENT_ICON[kind] ?? { icon: 'circle' as IconName, color: colors.textSubtle };
}

export function EventRowView({ event, deviceName, last }: { event: EventRow; deviceName?: string; last?: boolean }) {
  const s = eventStyle(event.type);
  return (
    <View style={styles.event}>
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.eventIcon, { backgroundColor: `${s.color}16` }]}>
          <Icon name={s.icon} size={16} color={s.color} />
        </View>
        {!last ? <View style={styles.eventLine} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: 14, minWidth: 0 }}>
        <Text style={[type.body, { fontSize: 14 }]}>{event.message}</Text>
        <Text style={[type.small, { fontSize: 12 }]}>
          {formatDateTime(event.created_at)}
          {deviceName ? ` · ${deviceName}` : ''} · {event.type}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tileIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'flex-start' },
  event: { flexDirection: 'row', gap: 12 },
  eventIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  eventLine: { width: 2, flex: 1, backgroundColor: colors.border, marginTop: 2 },
});

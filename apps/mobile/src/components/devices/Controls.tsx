import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useOnline } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { formatTemp, getTemperatureUnit } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { deviceApi, type CommandResult } from '@/services/device-api';
import { colors, font, type } from '@/theme';
import type { Device } from '@/types/db';
import { Gauge } from '../ui/charts';
import { Banner } from '../ui/feedback';
import { Segmented, Stepper } from '../ui/forms';
import { Button } from '../ui/primitives';

function haptic() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

function useCommand(device: Device) {
  const qc = useQueryClient();
  const toast = useToast();
  const { org } = useOrg();
  return useMutation({
    mutationFn: (fn: () => Promise<CommandResult>) => fn(),
    onMutate: async () => {
      haptic();
    },
    onSuccess: (res) => {
      toast.show({
        title: res.status === 'acknowledged' ? 'Device updated' : res.status === 'pending' ? 'Command queued' : 'Device did not respond',
        message: res.message,
        tone: res.status === 'acknowledged' ? 'success' : res.status === 'pending' ? 'info' : 'warning',
      });
    },
    onError: (err) => toast.show({ title: 'Command failed', message: errorMessage(err), tone: 'danger' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['devices', org?.id] });
      qc.invalidateQueries({ queryKey: ['commands', org?.id, device.id] });
      qc.invalidateQueries({ queryKey: ['events', org?.id] });
    },
  });
}

/** Explains why a control is disabled (offline network, role). */
export function ControlGate({ device }: { device: Device }) {
  const online = useOnline();
  const { can } = useOrg();
  if (!online) return <Banner tone="warning" icon="cloud-off" title="You are offline" message="Showing the last synced data. Controls are available again once you reconnect." />;
  if (!can('device.control')) return <Banner tone="info" icon="visibility" title="View-only access" message="Your role can view devices but not control them." />;
  if (device.status === 'offline') return <Banner tone="danger" icon="wifi-off" title="Device offline" message="Changes are saved as the desired state and applied when the device reconnects." />;
  return null;
}

export function ThermostatControl({ device }: { device: Device }) {
  const online = useOnline();
  const { can } = useOrg();
  const enabled = online && can('device.control');
  const desired = Number(device.desired_state?.setpoint ?? device.reported_state?.setpoint ?? 21);
  const [setpoint, setSetpoint] = useState(desired);
  const cmd = useCommand(device);
  useEffect(() => setSetpoint(desired), [desired]);

  const r = device.reported_state ?? {};
  const mode = (device.desired_state?.mode ?? r.mode ?? 'auto') as 'heat' | 'cool' | 'auto' | 'off';
  const fahrenheit = getTemperatureUnit() === 'fahrenheit';
  const hvacColor = r.hvac === 'heating' ? colors.heat : r.hvac === 'cooling' ? colors.cool : colors.primary;

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.thermoRow}>
        <Gauge value={Number(r.temperature ?? 0)} min={10} max={32} color={hvacColor} label={formatTemp(r.temperature)} sublabel={r.hvac === 'idle' || !r.hvac ? 'Idle' : r.hvac === 'heating' ? 'Heating' : 'Cooling'} />
        <View style={{ flex: 1, minWidth: 220, gap: 10 }}>
          <Text style={type.label}>Target temperature</Text>
          <Stepper value={setpoint} onChange={setSetpoint} min={10} max={32} step={fahrenheit ? 5 / 9 : 0.5} format={(v) => formatTemp(v)} disabled={!enabled} />
          <Button
            title={setpoint === desired ? 'Setpoint applied' : `Set to ${formatTemp(setpoint)}`}
            icon="thermostat"
            disabled={!enabled || setpoint === desired}
            loading={cmd.isPending}
            onPress={() => cmd.mutate(() => deviceApi.setTemperature(device.id, Math.round(setpoint * 10) / 10))}
          />
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={type.label}>Mode</Text>
        <Segmented
          disabled={!enabled || cmd.isPending}
          value={mode}
          onChange={(m) => cmd.mutate(() => deviceApi.setMode(device.id, m))}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'heat', label: 'Heat' },
            { value: 'cool', label: 'Cool' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </View>
    </View>
  );
}

export function PlugControl({ device }: { device: Device }) {
  const online = useOnline();
  const { can } = useOrg();
  const enabled = online && can('device.control');
  const cmd = useCommand(device);
  const desiredOn = Boolean(device.desired_state?.power);
  const reportedOn = Boolean(device.reported_state?.power);
  return (
    <View style={styles.plugRow}>
      <View style={[styles.plugIcon, { backgroundColor: reportedOn ? colors.successSoft : colors.surfaceAlt }]}>
        <Text style={{ fontFamily: font.bold, fontSize: 20, color: reportedOn ? colors.success : colors.textSubtle }}>{reportedOn ? 'ON' : 'OFF'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 200, gap: 4 }}>
        <Text style={type.h3}>{reportedOn ? 'Outlet is powered' : 'Outlet is switched off'}</Text>
        <Text style={type.small}>
          {desiredOn !== reportedOn ? `Waiting for the device to switch ${desiredOn ? 'on' : 'off'}…` : `Drawing ${device.reported_state?.watts ?? 0} W · ${device.reported_state?.energy_kwh ?? 0} kWh total`}
        </Text>
      </View>
      <Button
        title={desiredOn ? 'Turn off' : 'Turn on'}
        icon="power-settings-new"
        variant={desiredOn ? 'secondary' : 'primary'}
        size="lg"
        disabled={!enabled}
        loading={cmd.isPending}
        onPress={() => cmd.mutate(() => deviceApi.setPower(device.id, !desiredOn))}
        style={{ minWidth: 150 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  thermoRow: { flexDirection: 'row', alignItems: 'center', gap: 24, flexWrap: 'wrap', justifyContent: 'center' },
  plugRow: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  plugIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

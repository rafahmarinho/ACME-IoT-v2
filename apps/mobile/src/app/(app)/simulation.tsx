import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { DeviceGlyph } from '@/components/devices/DeviceCard';
import { RequirePermission } from '@/components/navigation/RequirePermission';
import { Banner, ConfirmDialog, Grid, PageHeader, Screen, useIsWide } from '@/components/ui/feedback';
import { Stepper, ToggleRow } from '@/components/ui/forms';
import { Badge, Button, Card, Divider, Icon, SectionTitle } from '@/components/ui/primitives';
import { EventRowView } from '@/components/ui/widgets';
import { useDevices, useEvents, useOnline, useSimulation } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { DEMO_CLAIM_CODES } from '@/lib/demo';
import { formatDateTime, formatTemp } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { deviceApi, SCENARIOS, simulationApi, type TickSummary } from '@/services/device-api';
import { colors, font, radius, type } from '@/theme';

function summaryText(s?: TickSummary) {
  if (!s) return '';
  const parts = [`${s.steps} step(s)`, `${s.readings} readings`];
  if (s.wentOffline) parts.push(`${s.wentOffline} went offline`);
  if (s.reconnected) parts.push(`${s.reconnected} reconnected`);
  if (s.automations) parts.push(`${s.automations} automation(s) ran`);
  if (s.firmware) parts.push(`${s.firmware} firmware update(s) progressed`);
  if (s.alerts) parts.push(`${s.alerts} new alert(s)`);
  return parts.join(' · ');
}

function SimulationInner() {
  const { org, can } = useOrg();
  const wide = useIsWide();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const sim = useSimulation();
  const devices = useDevices();
  const events = useEvents({ limit: 25 });
  const [steps, setSteps] = useState(6);
  const [confirmReset, setConfirmReset] = useState(false);
  const [last, setLast] = useState<string>('');
  const refreshAll = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === org?.id });

  const tick = useMutation({
    mutationFn: (n: number) => simulationApi.tick(org!.id, n),
    onSuccess: (r) => {
      refreshAll();
      setLast(summaryText(r.summary));
    },
    onError: (e) => toast.show({ title: 'Simulation failed', message: errorMessage(e), tone: 'danger' }),
  });
  const scenario = useMutation({
    mutationFn: (key: string) => simulationApi.scenario(org!.id, key),
    onSuccess: (r, key) => {
      refreshAll();
      setLast(summaryText(r.summary));
      toast.show({ title: `Scenario: ${SCENARIOS.find((s) => s.key === key)?.label}`, message: 'Advance the simulation to see its effects unfold.', tone: 'info' });
    },
    onError: (e) => toast.show({ title: 'Could not apply scenario', message: errorMessage(e), tone: 'danger' }),
  });
  const autoRun = useMutation({
    mutationFn: (enabled: boolean) => simulationApi.autoRun(org!.id, enabled),
    onSuccess: refreshAll,
    onError: (e) => toast.show({ title: 'Could not change live mode', message: errorMessage(e), tone: 'danger' }),
  });
  const reset = useMutation({
    mutationFn: () => simulationApi.reset(org!.id),
    onSuccess: (r) => {
      qc.invalidateQueries();
      setConfirmReset(false);
      setLast('');
      toast.show({ title: 'Demo data restored', message: r.message, tone: 'success' });
    },
    onError: (e) => toast.show({ title: 'Reset failed', message: errorMessage(e), tone: 'danger' }),
  });
  const deviceSim = useMutation({
    mutationFn: (p: { id: string; forcedOffline?: boolean; batteryLevel?: number }) => deviceApi.simulate(org!.id, p.id, { forcedOffline: p.forcedOffline, batteryLevel: p.batteryLevel }),
    onSuccess: refreshAll,
    onError: (e) => toast.show({ title: 'Could not update device', message: errorMessage(e), tone: 'danger' }),
  });

  const state = sim.data;
  const busy = tick.isPending || scenario.isPending;
  const ds = devices.data ?? [];

  return (
    <Screen onRefresh={() => (sim.refetch(), events.refetch())} refreshing={sim.isRefetching}>
      <PageHeader
        title="Simulation lab"
        subtitle="Devices talk to the ACME API over simulated HTTP. Pick a scenario, advance time and watch the screens update."
        actions={can('simulation.reset') ? <Button title="Reset demo data" icon="restart-alt" variant="danger" size="sm" onPress={() => setConfirmReset(true)} disabled={!online} /> : null}
      />
      {!online ? <Banner tone="warning" icon="cloud-off" title="Offline" message="Simulation controls need a connection." /> : null}

      <Grid min={220}>
        <Card key="time" style={{ gap: 4 }}>
          <Text style={type.label}>Simulated clock</Text>
          <Text style={type.metric}>{state ? new Date(state.sim_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}</Text>
          <Text style={type.small}>{state ? `${formatDateTime(state.sim_time)} · step ${state.tick_count}` : ''}</Text>
        </Card>
        <Card key="scenario" style={{ gap: 4 }}>
          <Text style={type.label}>Active scenario</Text>
          <Text style={[type.metric, { fontSize: 22 }]}>{SCENARIOS.find((s) => s.key === state?.scenario)?.label ?? '—'}</Text>
          <Text style={type.small}>Outdoor {formatTemp(state?.outdoor_temperature)}</Text>
        </Card>
        <Card key="live" style={{ gap: 4 }}>
          <ToggleRow label="Live mode" description="Advance one step (5 min) every 8 s while this app is open. Pauses in the background." value={!!state?.auto_run} onValueChange={(v) => autoRun.mutate(v)} disabled={!online || autoRun.isPending} />
        </Card>
      </Grid>

      <Card style={{ gap: 12 }}>
        <SectionTitle title="Advance time" subtitle="Each step is 5 simulated minutes: readings, batteries, connectivity, firmware and automations" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <View style={{ width: 260 }}>
            <Stepper value={steps} onChange={setSteps} min={1} max={24} step={1} format={(v) => `${v} step${v === 1 ? '' : 's'}`} disabled={busy} />
          </View>
          <Button title="Advance 1 step" icon="skip-next" variant="secondary" onPress={() => tick.mutate(1)} disabled={!online || busy} />
          <Button title={`Advance ${steps * 5} min`} icon="fast-forward" onPress={() => tick.mutate(steps)} loading={tick.isPending} disabled={!online || busy} />
        </View>
        {last ? <Banner tone="success" icon="check-circle" title="Simulation advanced" message={last} /> : null}
      </Card>

      <SectionTitle title="Scenarios" />
      <Grid min={260}>
        {SCENARIOS.map((s) => {
          const active = state?.scenario === s.key;
          return (
            <Pressable
              key={s.key}
              onPress={() => scenario.mutate(s.key)}
              disabled={!online || busy}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ hovered }: any) => ({ padding: 16, gap: 8, borderRadius: radius.lg, borderWidth: 1.5, minHeight: 120, borderColor: active ? colors.primary : hovered ? colors.primaryBorder : colors.border, backgroundColor: active ? colors.primarySoft : colors.surface, opacity: !online ? 0.6 : 1 })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name={s.icon} size={22} color={active ? colors.primary : colors.textMuted} />
                <Text style={[type.h3, { flex: 1 }]}>{s.label}</Text>
                {active ? <Badge label="Active" tone="primary" /> : null}
              </View>
              <Text style={type.small}>{s.description}</Text>
            </Pressable>
          );
        })}
      </Grid>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ flex: wide ? 1.3 : undefined, width: wide ? undefined : '100%' }}>
          <SectionTitle title="Device faults" subtitle="Disconnect devices or drain batteries to test alerts and reconnection" />
          {ds.map((d, i) => (
            <View key={d.id}>
              {i ? <Divider /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, flexWrap: 'wrap' }}>
                <DeviceGlyph type={d.type} size={32} dim={d.status === 'offline'} />
                <Text style={[type.body, { flex: 1, minWidth: 140, fontFamily: font.medium, fontSize: 14 }]} numberOfLines={1} onPress={() => router.push(`/devices/${d.id}`)}>{d.name}</Text>
                <Badge label={d.status === 'online' ? 'Online' : d.sim?.forced_offline ? 'Disconnected' : 'Offline'} tone={d.status === 'online' ? 'success' : 'danger'} dot />
                {d.battery_level !== null ? (
                  <Button title={d.battery_level < 20 ? 'Replace battery' : 'Drain battery'} size="sm" variant="ghost" onPress={() => deviceSim.mutate({ id: d.id, batteryLevel: d.battery_level! < 20 ? 100 : 9 })} disabled={!online} />
                ) : null}
                <Button title={d.sim?.forced_offline ? 'Reconnect' : 'Disconnect'} size="sm" variant={d.sim?.forced_offline ? 'subtle' : 'secondary'} onPress={() => deviceSim.mutate({ id: d.id, forcedOffline: !d.sim?.forced_offline })} disabled={!online} />
              </View>
            </View>
          ))}
        </Card>
        <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: 16 }}>
          <Card style={{ gap: 12 }}>
            <SectionTitle title="Unclaimed demo devices" subtitle="Scan with the mobile app (Devices → Add) or type the code" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {DEMO_CLAIM_CODES.map((c) => (
                <View key={c} style={{ alignItems: 'center', gap: 6, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' }}>
                  <QRCode value={`acmeiot://claim?code=${c}`} size={96} color={colors.text} />
                  <Text style={{ fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 11, color: colors.textMuted }}>{c}</Text>
                </View>
              ))}
            </View>
          </Card>
          <Card>
            <SectionTitle title="Latest events" action={<Button title="All events" size="sm" variant="ghost" onPress={() => router.push('/events')} />} />
            {(events.data ?? []).slice(0, 12).map((e, i, arr) => (
              <EventRowView key={e.id} event={e} deviceName={ds.find((d) => d.id === e.device_id)?.name} last={i === arr.length - 1} />
            ))}
          </Card>
        </View>
      </View>

      <ConfirmDialog
        visible={confirmReset}
        title="Reset demo data?"
        message="Both demo organizations (Acme Corporation and Bluefin Hotels) return to their original buildings, 20 devices, readings, automations and history. Changes you made will be lost."
        confirmLabel="Reset data"
        destructive
        loading={reset.isPending}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => reset.mutate()}
      />
    </Screen>
  );
}

export default function Simulation() {
  return (
    <RequirePermission action="simulation.run">
      <SimulationInner />
    </RequirePermission>
  );
}

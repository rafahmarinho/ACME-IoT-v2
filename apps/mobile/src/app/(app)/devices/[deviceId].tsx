import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { ControlGate, PlugControl, ThermostatControl } from '@/components/devices/Controls';
import { BatteryIndicator, DeviceGlyph, StateComparison, StatusBadge } from '@/components/devices/DeviceCard';
import { LineChart } from '@/components/ui/charts';
import { Banner, ConfirmDialog, EmptyState, FormSheet, KeyValue, PageHeader, ProgressBar, Screen, SkeletonCards, useIsWide } from '@/components/ui/feedback';
import { Segmented, Select, TextField } from '@/components/ui/forms';
import { Badge, Button, Card, SectionTitle } from '@/components/ui/primitives';
import { EventRowView } from '@/components/ui/widgets';
import { useBuildings, useCommands, useDevices, useEvents, useFirmwareJobs, useOnline, useReadings, useRooms } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { DEVICE_LABEL, formatDateTime, formatMetric, formatTemp, METRIC_LABEL, metricsFor, timeAgo } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { deviceService } from '@/services/db';
import { deviceApi } from '@/services/device-api';
import { colors, type } from '@/theme';
import type { Metric } from '@/types/db';

const COMMAND_TONE = { acknowledged: 'success', delivered: 'info', pending: 'warning', failed: 'danger', expired: 'neutral' } as const;

export default function DeviceDetail() {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const { org, can } = useOrg();
  const wide = useIsWide();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const devices = useDevices();
  const rooms = useRooms();
  const buildings = useBuildings();
  const device = devices.data?.find((d) => d.id === deviceId);
  const metrics = device ? metricsFor(device.type) : (['temperature'] as Metric[]);
  const [metric, setMetric] = useState<Metric>(metrics[0]);
  const [hours, setHours] = useState('24');
  useEffect(() => {
    if (device && !metricsFor(device.type).includes(metric)) setMetric(metricsFor(device.type)[0]);
  }, [device?.type]); // eslint-disable-line react-hooks/exhaustive-deps
  const readings = useReadings(device?.id, metric, Number(hours));
  const commands = useCommands(device?.id);
  const events = useEvents({ deviceId, limit: 20 });
  const jobs = useFirmwareJobs();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState<string>('');

  const room = rooms.data?.find((r) => r.id === device?.room_id);
  const building = buildings.data?.find((b) => b.id === room?.building_id);
  const activeJob = (jobs.data ?? []).find((j) => j.device_id === deviceId && ['queued', 'downloading', 'installing', 'verifying'].includes(j.status));
  const chartData = useMemo(() => (readings.data ?? []).map((r) => ({ t: r.recorded_at, v: Number(r.value) })), [readings.data]);

  const save = useMutation({
    mutationFn: () => deviceService.update(deviceId, { name: name.trim(), room_id: roomId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices', org?.id] });
      toast.show({ title: 'Device updated', tone: 'success' });
      setEditing(false);
    },
    onError: (e) => toast.show({ title: 'Could not update device', message: errorMessage(e), tone: 'danger' }),
  });
  const remove = useMutation({
    mutationFn: () => deviceService.remove(deviceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices', org?.id] });
      toast.show({ title: 'Device removed', tone: 'success' });
      router.replace('/devices');
    },
    onError: (e) => toast.show({ title: 'Could not remove device', message: errorMessage(e), tone: 'danger' }),
  });
  const reboot = useMutation({
    mutationFn: () => deviceApi.reboot(deviceId),
    onSuccess: (r) => toast.show({ title: 'Reboot requested', message: r.message, tone: 'info' }),
    onError: (e) => toast.show({ title: 'Reboot failed', message: errorMessage(e), tone: 'danger' }),
  });

  if (devices.isLoading && !devices.data) return <Screen><SkeletonCards count={4} /></Screen>;
  if (!device) return <Screen><PageHeader back="/devices" title="Device" /><EmptyState icon="developer-board-off" title="Device not found" message="It may have been removed or belongs to another organization." /></Screen>;

  const offline = device.status === 'offline';
  const controllable = device.type === 'thermostat' || device.type === 'smart_plug';
  const fmt = (v: number) => (metric === 'temperature' || metric === 'setpoint' ? formatTemp(v) : formatMetric(metric, v));
  const metricColor = metric === 'temperature' ? colors.heat : metric === 'humidity' ? colors.info : metric === 'occupancy' ? '#9333EA' : metric === 'power' ? '#0D9488' : colors.primary;

  return (
    <Screen onRefresh={() => Promise.all([devices.refetch(), readings.refetch(), commands.refetch(), events.refetch()])} refreshing={devices.isRefetching}>
      <PageHeader
        back="/devices"
        title={device.name}
        subtitle={`${DEVICE_LABEL[device.type]} · ${device.model} · ${room ? `${building?.name ?? ''} › ${room.name}` : 'Unassigned'}`}
        actions={
          <>
            {can('device.control') ? <Button title="Reboot" icon="restart-alt" size="sm" variant="secondary" onPress={() => reboot.mutate()} loading={reboot.isPending} disabled={!online || offline} /> : null}
            {can('device.manage') ? (
              <>
                <Button
                  title="Edit"
                  icon="edit"
                  size="sm"
                  variant="secondary"
                  disabled={!online}
                  onPress={() => {
                    setName(device.name);
                    setRoomId(device.room_id ?? '');
                    setEditing(true);
                  }}
                />
                <Button title="Remove" icon="delete-outline" size="sm" variant="danger" disabled={!online} onPress={() => setDeleting(true)} />
              </>
            ) : null}
          </>
        }
      />

      {activeJob ? (
        <Banner
          tone="info"
          icon="system-update-alt"
          title={`Firmware ${activeJob.to_version}: ${activeJob.status} (${activeJob.progress}%)`}
          message={offline ? 'Paused until the device reconnects.' : 'Advance the simulation to continue the rollout.'}
          action={<View style={{ width: 100 }}><ProgressBar value={activeJob.progress} /></View>}
        />
      ) : null}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <View style={{ flex: wide ? 1.5 : undefined, width: wide ? undefined : '100%', gap: 16 }}>
          {controllable ? (
            <Card style={{ gap: 16 }}>
              <SectionTitle title="Controls" subtitle="Sent to the device over the ACME device API (HTTPS)" />
              <ControlGate device={device} />
              {device.type === 'thermostat' ? <ThermostatControl device={device} /> : <PlugControl device={device} />}
            </Card>
          ) : null}
          <Card style={{ gap: 12 }}>
            <SectionTitle title="Desired vs reported state" subtitle="Desired = what you asked for. Reported = what the device last confirmed." />
            <StateComparison device={device} />
          </Card>
          <Card style={{ gap: 12 }}>
            <SectionTitle title="Readings" action={<View style={{ width: 160 }}><Segmented value={hours} onChange={setHours} options={[{ value: '6', label: '6h' }, { value: '24', label: '24h' }, { value: '72', label: '3d' }]} /></View>} />
            {metrics.length > 1 ? <Segmented value={metric} onChange={(m) => setMetric(m as Metric)} options={metrics.map((m) => ({ value: m, label: METRIC_LABEL[m] }))} /> : null}
            {readings.isLoading && !readings.data ? <SkeletonCards count={1} height={200} /> : <LineChart data={chartData} color={metricColor} format={fmt} height={220} step={metric === 'setpoint'} />}
            {chartData.length ? (
              <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
                <Text style={type.small}>Min {fmt(Math.min(...chartData.map((p) => p.v)))}</Text>
                <Text style={type.small}>Max {fmt(Math.max(...chartData.map((p) => p.v)))}</Text>
                <Text style={type.small}>Avg {fmt(chartData.reduce((s, p) => s + p.v, 0) / chartData.length)}</Text>
                <Text style={type.small}>{chartData.length} readings</Text>
              </View>
            ) : null}
          </Card>
        </View>

        <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: 16 }}>
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <DeviceGlyph type={device.type} size={48} dim={offline} />
              <View style={{ flex: 1 }}>
                <StatusBadge device={device} />
                <Text style={[type.small, { marginTop: 4 }]}>{offline ? `Last seen ${timeAgo(device.last_seen_at)}` : `Heartbeat ${timeAgo(device.last_seen_at)}`}</Text>
              </View>
              <BatteryIndicator level={device.battery_level} />
            </View>
            <KeyValue label="Serial number" value={device.serial} mono />
            <KeyValue label="Model" value={device.model} />
            <KeyValue label="Firmware" value={device.firmware_version} mono />
            <KeyValue label="Signal" value={`${device.signal_strength} dBm`} />
            <KeyValue label="Mount" value={device.mount} />
            <KeyValue label="Registered" value={formatDateTime(device.created_at)} />
            {can('firmware.view') ? <Button title="Firmware & updates" variant="ghost" icon="system-update-alt" onPress={() => router.push('/firmware')} style={{ marginTop: 8 }} /> : null}
          </Card>
          <Card style={{ gap: 8 }}>
            <SectionTitle title="Command history" />
            {(commands.data ?? []).map((c) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontSize: 14 }]}>
                    {c.kind.replace('_', ' ')} {c.payload.setpoint !== undefined ? `→ ${formatTemp(c.payload.setpoint)}` : c.payload.power !== undefined ? `→ ${c.payload.power ? 'ON' : 'OFF'}` : c.payload.mode ? `→ ${c.payload.mode}` : ''}
                  </Text>
                  <Text style={type.small}>
                    {c.source === 'automation' ? 'Automation' : 'User'} · {timeAgo(c.created_at)}
                    {c.error ? ` · ${c.error}` : ''}
                  </Text>
                </View>
                <Badge label={c.status} tone={COMMAND_TONE[c.status]} />
              </View>
            ))}
            {commands.data && !commands.data.length ? <Text style={type.small}>No commands sent yet.</Text> : null}
          </Card>
          <Card>
            <SectionTitle title="Events" />
            {(events.data ?? []).slice(0, 10).map((e, i, arr) => (
              <EventRowView key={e.id} event={e} last={i === arr.length - 1} />
            ))}
            {events.data && !events.data.length ? <Text style={type.small}>No events for this device.</Text> : null}
          </Card>
        </View>
      </View>

      <FormSheet visible={editing} title="Edit device" onClose={() => setEditing(false)}>
        <TextField label="Name" value={name} onChangeText={setName} />
        <Select
          label="Room"
          value={roomId}
          onChange={setRoomId}
          options={[{ value: '', label: 'Unassigned' }, ...(rooms.data ?? []).map((r) => ({ value: r.id, label: r.name, description: buildings.data?.find((b) => b.id === r.building_id)?.name }))]}
        />
        <Button title="Save" size="lg" onPress={() => save.mutate()} loading={save.isPending} disabled={name.trim().length < 2} />
      </FormSheet>
      <ConfirmDialog
        visible={deleting}
        title="Remove this device?"
        message="Its readings, commands and history will be deleted. You can register it again later with its claim code."
        confirmLabel="Remove device"
        destructive
        loading={remove.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
      />
    </Screen>
  );
}

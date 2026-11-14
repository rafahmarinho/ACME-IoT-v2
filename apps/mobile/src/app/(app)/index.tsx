import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Room3DView } from '@/components/room3d/Room3DView';
import { LineChart } from '@/components/ui/charts';
import { EmptyState, ErrorState, Grid, PageHeader, Screen, SkeletonCards, useIsWide } from '@/components/ui/feedback';
import { Chips } from '@/components/ui/forms';
import { Badge, Button, Card, Divider, ListItem, SectionTitle } from '@/components/ui/primitives';
import { AlertRow, EventRowView, StatTile } from '@/components/ui/widgets';
import { DeviceGlyph } from '@/components/devices/DeviceCard';
import { useAlerts, useBuildings, useDevices, useEvents, useOrgReadings, useRooms, useSimulation } from '@/hooks/queries';
import { formatMetric, formatTemp, pendingKeys, timeAgo } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { colors, type } from '@/theme';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { org, profile, can } = useOrg();
  const wide = useIsWide();
  const devices = useDevices();
  const rooms = useRooms();
  const buildings = useBuildings();
  const alerts = useAlerts();
  const events = useEvents({ limit: 8 });
  const temps = useOrgReadings('temperature', 24);
  const sim = useSimulation();

  const list = devices.data ?? [];
  const roomList = rooms.data ?? [];
  const roomsWithDevices = roomList.filter((r) => list.some((d) => d.room_id === r.id));
  const [roomId, setRoomId] = useState<string | null>(null);
  const featured = roomList.find((r) => r.id === roomId) ?? roomsWithDevices.sort((a, b) => list.filter((d) => d.room_id === b.id).length - list.filter((d) => d.room_id === a.id).length)[0];

  const stats = useMemo(() => {
    const online = list.filter((d) => d.status === 'online');
    const temps = online.map((d) => d.reported_state?.temperature).filter((v): v is number => typeof v === 'number');
    const watts = online.filter((d) => d.type === 'smart_plug').reduce((s, d) => s + Number(d.reported_state?.watts ?? 0), 0);
    const people = online.filter((d) => d.type === 'occupancy_sensor').reduce((s, d) => s + Number(d.reported_state?.count ?? 0), 0);
    return {
      online: online.length,
      total: list.length,
      avgTemp: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
      watts,
      people,
      openAlerts: (alerts.data ?? []).filter((a) => a.status === 'open'),
    };
  }, [list, alerts.data]);

  const trend = useMemo(() => {
    const buckets = new Map<string, { sum: number; n: number }>();
    for (const r of temps.data ?? []) {
      const d = new Date(r.recorded_at);
      d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
      const k = d.toISOString();
      const b = buckets.get(k) ?? { sum: 0, n: 0 };
      b.sum += Number(r.value);
      b.n++;
      buckets.set(k, b);
    }
    return [...buckets.entries()].map(([t, b]) => ({ t, v: Math.round((b.sum / b.n) * 10) / 10 }));
  }, [temps.data]);

  const attention = list.filter((d) => d.status === 'offline' || (d.battery_level !== null && d.battery_level < 20) || pendingKeys(d).length).slice(0, 6);
  const deviceName = (id: string | null) => list.find((d) => d.id === id)?.name;
  const loading = devices.isLoading && !devices.data;

  return (
    <Screen onRefresh={() => Promise.all([devices.refetch(), alerts.refetch(), events.refetch(), temps.refetch()])} refreshing={devices.isRefetching}>
      <PageHeader
        title={`${greeting()}, ${profile?.full_name?.split(' ')[0] ?? 'there'}`}
        subtitle={`${org?.name} · ${sim.data ? `Simulation: ${sim.data.scenario.replace('_', ' ')} · ${formatTemp(sim.data.outdoor_temperature)} outside` : 'Live overview'}`}
        actions={
          <>
            {can('simulation.run') ? <Button title="Simulation" icon="science" variant="secondary" size="sm" onPress={() => router.push('/simulation')} /> : null}
            {can('device.manage') ? <Button title="Add device" icon="add" size="sm" onPress={() => router.push('/devices/add')} /> : null}
          </>
        }
      />

      {devices.error && !devices.data ? <ErrorState error={devices.error} onRetry={() => devices.refetch()} /> : null}
      {loading ? (
        <SkeletonCards count={4} height={116} />
      ) : (
        <Grid min={wide ? 200 : 150}>
          <StatTile key="online" icon="wifi" label="Devices online" value={`${stats.online}/${stats.total}`} sub={`${stats.total - stats.online} offline`} tone={stats.online === stats.total ? colors.success : colors.warning} onPress={() => router.push('/devices')} />
          <StatTile key="alerts" icon="notifications-active" label="Open alerts" value={String(stats.openAlerts.length)} sub={`${stats.openAlerts.filter((a) => a.severity === 'critical').length} critical`} tone={stats.openAlerts.length ? colors.danger : colors.success} onPress={() => router.push('/alerts')} />
          <StatTile key="temp" icon="device-thermostat" label="Avg. temperature" value={formatTemp(stats.avgTemp)} sub="Across online sensors" tone={colors.heat} />
          <StatTile key="power" icon="bolt" label="Plug load now" value={formatMetric('power', stats.watts)} sub={`${stats.people} people on site`} tone="#0D9488" />
        </Grid>
      )}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
        <Card style={{ flex: wide ? 1.6 : undefined, gap: 12 }}>
          <SectionTitle
            title={featured ? featured.name : 'Room view'}
            subtitle={featured ? `${buildings.data?.find((b) => b.id === featured.building_id)?.name ?? ''} · Floor ${featured.floor} · live 3D twin` : undefined}
            action={featured ? <Button title="Open room" size="sm" variant="ghost" icon="arrow-forward" onPress={() => router.push(`/rooms/${featured.id}`)} /> : null}
          />
          {roomsWithDevices.length > 1 ? (
            <Chips value={featured?.id ?? ''} onChange={setRoomId} options={roomsWithDevices.map((r) => ({ value: r.id, label: r.name, count: list.filter((d) => d.room_id === r.id).length }))} />
          ) : null}
          {featured ? (
            <Room3DView room={featured} devices={list.filter((d) => d.room_id === featured.id)} height={wide ? 440 : 340} compact={!wide} />
          ) : rooms.isLoading ? (
            <SkeletonCards count={1} height={300} />
          ) : (
            <EmptyState icon="meeting-room" title="No rooms with devices yet" message="Add a building and a room, then register your first device." />
          )}
        </Card>

        <View style={{ flex: wide ? 1 : undefined, gap: 16 }}>
          <Card style={{ gap: 4 }}>
            <SectionTitle title="Needs attention" action={attention.length ? <Badge label={String(attention.length)} tone="warning" /> : null} />
            {attention.length ? (
              attention.map((d) => (
                <ListItem
                  key={d.id}
                  left={<DeviceGlyph type={d.type} size={34} dim={d.status === 'offline'} />}
                  title={d.name}
                  subtitle={d.status === 'offline' ? `Offline · last seen ${timeAgo(d.last_seen_at)}` : d.battery_level !== null && d.battery_level < 20 ? `Battery ${d.battery_level}%` : 'Waiting for device to apply changes'}
                  right={<Badge label={d.status === 'offline' ? 'Offline' : d.battery_level !== null && d.battery_level < 20 ? 'Battery' : 'Syncing'} tone={d.status === 'offline' ? 'danger' : 'warning'} />}
                  onPress={() => router.push(`/devices/${d.id}`)}
                />
              ))
            ) : (
              <Text style={[type.small, { paddingVertical: 8 }]}>All devices are healthy. 🎉</Text>
            )}
          </Card>
          <Card>
            <SectionTitle title="Open alerts" action={<Button title="View all" size="sm" variant="ghost" onPress={() => router.push('/alerts')} />} />
            {stats.openAlerts.length ? (
              stats.openAlerts.slice(0, 3).map((a, i) => (
                <View key={a.id}>
                  {i ? <Divider /> : null}
                  <AlertRow alert={a} deviceName={deviceName(a.device_id)} />
                </View>
              ))
            ) : (
              <Text style={type.small}>No open alerts.</Text>
            )}
          </Card>
        </View>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
        <Card style={{ flex: wide ? 1.6 : undefined }}>
          <SectionTitle title="Average temperature" subtitle="All online temperature sources, last 24 hours" />
          <LineChart data={trend} color={colors.heat} format={(v) => formatTemp(v, 1)} height={200} />
        </Card>
        <Card style={{ flex: wide ? 1 : undefined }}>
          <SectionTitle title="Recent activity" action={<Button title="All events" size="sm" variant="ghost" onPress={() => router.push('/events')} />} />
          {(events.data ?? []).slice(0, 6).map((e, i, arr) => (
            <EventRowView key={e.id} event={e} deviceName={deviceName(e.device_id)} last={i === arr.length - 1} />
          ))}
          {events.data && !events.data.length ? <Text style={type.small}>No activity yet.</Text> : null}
        </Card>
      </View>

      <SectionTitle title="Buildings" />
      <Grid min={300}>
        {(buildings.data ?? []).map((b) => {
          const rs = roomList.filter((r) => r.building_id === b.id);
          const ds = list.filter((d) => rs.some((r) => r.id === d.room_id));
          const off = ds.filter((d) => d.status === 'offline').length;
          return (
            <Card key={b.id} onPress={() => router.push(`/buildings/${b.id}`)} style={{ gap: 8 }}>
              <Text style={type.h3}>{b.name}</Text>
              <Text style={type.small}>
                {b.city} · {rs.length} rooms · {ds.length} devices
              </Text>
              <Badge label={off ? `${off} offline` : 'All online'} tone={off ? 'danger' : 'success'} dot />
            </Card>
          );
        })}
      </Grid>
    </Screen>
  );
}

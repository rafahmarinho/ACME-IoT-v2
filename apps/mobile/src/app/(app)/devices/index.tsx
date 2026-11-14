import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { DeviceCard } from '@/components/devices/DeviceCard';
import { EmptyState, ErrorState, Grid, PageHeader, Screen, SkeletonCards } from '@/components/ui/feedback';
import { Chips, SearchBar, Select } from '@/components/ui/forms';
import { Button } from '@/components/ui/primitives';
import { useBuildings, useDevices, useOnline, useRooms } from '@/hooks/queries';
import { DEVICE_LABEL, pendingKeys } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import type { DeviceType } from '@/types/db';

type StatusFilter = 'all' | 'online' | 'offline' | 'attention';

export default function Devices() {
  const { can } = useOrg();
  const online = useOnline();
  const devices = useDevices();
  const rooms = useRooms();
  const buildings = useBuildings();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [kind, setKind] = useState<'all' | DeviceType>('all');
  const [building, setBuilding] = useState<string>('all');
  const [sort, setSort] = useState('name');

  const roomById = useMemo(() => new Map((rooms.data ?? []).map((r) => [r.id, r])), [rooms.data]);
  const all = devices.data ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = all.filter((d) => {
      const room = d.room_id ? roomById.get(d.room_id) : undefined;
      if (needle && !`${d.name} ${d.serial} ${d.model} ${room?.name ?? ''} ${DEVICE_LABEL[d.type]}`.toLowerCase().includes(needle)) return false;
      if (kind !== 'all' && d.type !== kind) return false;
      if (building !== 'all' && room?.building_id !== building) return false;
      if (status === 'online' && d.status !== 'online') return false;
      if (status === 'offline' && d.status !== 'offline') return false;
      if (status === 'attention' && !(d.status === 'offline' || (d.battery_level ?? 100) < 20 || pendingKeys(d).length)) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === 'status') return a.status.localeCompare(b.status) || a.name.localeCompare(b.name);
      if (sort === 'battery') return (a.battery_level ?? 101) - (b.battery_level ?? 101);
      if (sort === 'room') return (roomById.get(a.room_id ?? '')?.name ?? '').localeCompare(roomById.get(b.room_id ?? '')?.name ?? '');
      return a.name.localeCompare(b.name);
    });
  }, [all, q, kind, building, status, sort, roomById]);

  const count = (fn: (d: (typeof all)[number]) => boolean) => all.filter(fn).length;

  return (
    <Screen onRefresh={() => devices.refetch()} refreshing={devices.isRefetching}>
      <PageHeader
        title="Devices"
        subtitle={`${all.length} registered · ${count((d) => d.status === 'online')} online`}
        actions={can('device.manage') ? <Button title="Add device" icon="qr-code-scanner" size="sm" onPress={() => router.push('/devices/add')} disabled={!online} /> : null}
      />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search by name, serial, model or room" />
      <Chips<StatusFilter>
        value={status}
        onChange={setStatus}
        options={[
          { value: 'all', label: 'All', count: all.length },
          { value: 'online', label: 'Online', count: count((d) => d.status === 'online') },
          { value: 'offline', label: 'Offline', count: count((d) => d.status === 'offline') },
          { value: 'attention', label: 'Needs attention', count: count((d) => d.status === 'offline' || (d.battery_level ?? 100) < 20 || pendingKeys(d).length > 0) },
        ]}
      />
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Select
            label="Type"
            value={kind}
            onChange={(v) => setKind(v as any)}
            options={[{ value: 'all', label: 'All types' }, ...(Object.keys(DEVICE_LABEL) as DeviceType[]).map((t) => ({ value: t, label: DEVICE_LABEL[t] }))]}
          />
        </View>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Select label="Building" value={building} onChange={setBuilding} options={[{ value: 'all', label: 'All buildings' }, ...(buildings.data ?? []).map((b) => ({ value: b.id, label: b.name }))]} />
        </View>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Select
            label="Sort by"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'name', label: 'Name' },
              { value: 'status', label: 'Status' },
              { value: 'room', label: 'Room' },
              { value: 'battery', label: 'Battery (lowest first)' },
            ]}
          />
        </View>
      </View>
      {devices.error && !devices.data ? <ErrorState error={devices.error} onRetry={() => devices.refetch()} /> : null}
      {devices.isLoading && !devices.data ? <SkeletonCards count={6} /> : null}
      {devices.data && !filtered.length ? (
        <EmptyState
          icon="search-off"
          title={all.length ? 'No devices match these filters' : 'No devices yet'}
          message={all.length ? 'Try clearing the search or choosing another filter.' : 'Scan a QR code or type a claim code to register your first device.'}
          action={
            all.length ? (
              <Button title="Clear filters" variant="secondary" size="sm" onPress={() => (setQ(''), setStatus('all'), setKind('all'), setBuilding('all'))} />
            ) : can('device.manage') ? (
              <Button title="Add device" icon="add" size="sm" onPress={() => router.push('/devices/add')} />
            ) : undefined
          }
        />
      ) : null}
      <Grid min={300}>
        {filtered.map((d) => {
          const room = d.room_id ? roomById.get(d.room_id) : undefined;
          return <DeviceCard key={d.id} device={d} roomName={room ? room.name : 'Unassigned'} onPress={() => router.push(`/devices/${d.id}`)} />;
        })}
      </Grid>
    </Screen>
  );
}

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { EmptyState, ErrorState, PageHeader, Screen, SkeletonCards } from '@/components/ui/feedback';
import { Chips, SearchBar, Select } from '@/components/ui/forms';
import { Card } from '@/components/ui/primitives';
import { EventRowView } from '@/components/ui/widgets';
import { useDevices, useEvents } from '@/hooks/queries';

const TYPES = [
  { value: '', label: 'All' },
  { value: 'device', label: 'Connectivity' },
  { value: 'command', label: 'Commands' },
  { value: 'automation', label: 'Automations' },
  { value: 'firmware', label: 'Firmware' },
  { value: 'simulation', label: 'Simulation' },
  { value: 'team', label: 'Team' },
];

export default function Events() {
  const devices = useDevices();
  const [type, setType] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const events = useEvents({ type, deviceId: deviceId || undefined, search: debounced, limit: 200 });
  const name = (id: string | null) => devices.data?.find((d) => d.id === id)?.name;
  const list = events.data ?? [];

  return (
    <Screen onRefresh={() => events.refetch()} refreshing={events.isRefetching}>
      <PageHeader title="Events" subtitle="Audit trail of everything that happened across your devices" />
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search event messages" />
      <Chips value={type} onChange={setType} options={TYPES} />
      <View style={{ maxWidth: 360 }}>
        <Select label="Device" value={deviceId} onChange={setDeviceId} options={[{ value: '', label: 'All devices' }, ...(devices.data ?? []).map((d) => ({ value: d.id, label: d.name }))]} />
      </View>
      {events.error && !events.data ? <ErrorState error={events.error} onRetry={() => events.refetch()} /> : null}
      {events.isLoading && !events.data ? <SkeletonCards count={2} height={200} /> : null}
      {events.data && !list.length ? <EmptyState icon="history" title="No events match" message="Try another filter, or advance the simulation to generate activity." /> : null}
      {list.length ? (
        <Card>
          {list.map((e, i) => (
            <EventRowView key={e.id} event={e} deviceName={name(e.device_id)} last={i === list.length - 1} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

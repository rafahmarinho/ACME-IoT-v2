import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { EmptyState, ErrorState, FormSheet, Grid, PageHeader, Screen, SkeletonCards } from '@/components/ui/feedback';
import { SearchBar, TextField } from '@/components/ui/forms';
import { Badge, Button, Card, Icon } from '@/components/ui/primitives';
import { useBuildings, useDevices, useOnline, useRooms } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { BuildingForm } from '@/components/spaces/SpaceForms';
import { colors, font, radius, type } from '@/theme';

const GRADIENTS: [string, string][] = [
  ['#6366F1', '#4338CA'],
  ['#0EA5E9', '#2563EB'],
  ['#14B8A6', '#0F766E'],
  ['#F59E0B', '#EA580C'],
];

export default function Buildings() {
  const { can } = useOrg();
  const online = useOnline();
  const buildings = useBuildings();
  const rooms = useRooms();
  const devices = useDevices();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const list = (buildings.data ?? []).filter((b) => `${b.name} ${b.city} ${b.address}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Screen onRefresh={() => buildings.refetch()} refreshing={buildings.isRefetching}>
      <PageHeader
        title="Buildings"
        subtitle="Organization → building → room → device"
        actions={can('space.manage') ? <Button title="New building" icon="add-business" size="sm" onPress={() => setCreating(true)} disabled={!online} /> : null}
      />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search buildings by name or city" />
      {buildings.error && !buildings.data ? <ErrorState error={buildings.error} onRetry={() => buildings.refetch()} /> : null}
      {buildings.isLoading && !buildings.data ? <SkeletonCards count={3} height={220} /> : null}
      {buildings.data && !list.length ? (
        <EmptyState icon="apartment" title={q ? 'No buildings match your search' : 'No buildings yet'} message={q ? 'Try a different name or city.' : 'Create your first building to start organizing rooms and devices.'} />
      ) : null}
      <Grid min={320}>
        {list.map((b, i) => {
          const rs = (rooms.data ?? []).filter((r) => r.building_id === b.id);
          const ds = (devices.data ?? []).filter((d) => rs.some((r) => r.id === d.room_id));
          const off = ds.filter((d) => d.status === 'offline').length;
          return (
            <Card key={b.id} padded={false} onPress={() => router.push(`/buildings/${b.id}`)} style={{ overflow: 'hidden' }}>
              <LinearGradient colors={GRADIENTS[i % GRADIENTS.length]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 96, padding: 16, justifyContent: 'space-between' }}>
                <Icon name="apartment" size={28} color="rgba(255,255,255,0.9)" />
                <Text style={{ color: '#fff', fontFamily: font.medium, fontSize: 12 }}>{b.floors} floors</Text>
              </LinearGradient>
              <View style={{ padding: 16, gap: 6 }}>
                <Text style={type.h3}>{b.name}</Text>
                <Text style={type.small}>{[b.address, b.city].filter(Boolean).join(', ')}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <Badge label={`${rs.length} rooms`} tone="primary" icon="meeting-room" />
                  <Badge label={`${ds.length} devices`} tone="neutral" icon="developer-board" />
                  {off ? <Badge label={`${off} offline`} tone="danger" dot /> : null}
                </View>
              </View>
            </Card>
          );
        })}
      </Grid>
      <BuildingForm key={String(creating)} visible={creating} onClose={() => setCreating(false)} />
      <View style={{ height: 1, borderRadius: radius.sm, backgroundColor: colors.bg }} />
    </Screen>
  );
}

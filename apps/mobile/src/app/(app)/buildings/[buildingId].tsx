import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ConfirmDialog, EmptyState, ErrorState, FormSheet, Grid, PageHeader, Screen, SkeletonCards } from '@/components/ui/feedback';
import { Select, TextField } from '@/components/ui/forms';
import { Badge, Button, Card, Icon } from '@/components/ui/primitives';
import { DeviceGlyph } from '@/components/devices/DeviceCard';
import { useBuildings, useDevices, useOnline, useRooms } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { formatTemp, ROOM_KIND_LABEL } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { spaceService } from '@/services/db';
import { colors, type } from '@/theme';
import type { Room, RoomKind } from '@/types/db';
import { BuildingForm, RoomForm } from '@/components/spaces/SpaceForms';

export default function BuildingDetail() {
  const { buildingId } = useLocalSearchParams<{ buildingId: string }>();
  const { org, can } = useOrg();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const buildings = useBuildings();
  const rooms = useRooms();
  const devices = useDevices();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const building = buildings.data?.find((b) => b.id === buildingId);
  const rs = (rooms.data ?? []).filter((r) => r.building_id === buildingId);
  const floors = [...new Set(rs.map((r) => r.floor))].sort((a, b) => b - a);

  const remove = useMutation({
    mutationFn: () => spaceService.deleteBuilding(buildingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buildings', org?.id] });
      qc.invalidateQueries({ queryKey: ['rooms', org?.id] });
      toast.show({ title: 'Building deleted', tone: 'success' });
      router.replace('/buildings');
    },
    onError: (e) => toast.show({ title: 'Could not delete building', message: errorMessage(e), tone: 'danger' }),
  });

  if (buildings.isLoading && !buildings.data) return <Screen><SkeletonCards count={4} /></Screen>;
  if (buildings.error && !buildings.data) return <Screen><ErrorState error={buildings.error} onRetry={() => buildings.refetch()} /></Screen>;
  if (!building) return <Screen><EmptyState icon="apartment" title="Building not found" message="It may have been deleted or belongs to another organization." /></Screen>;

  return (
    <Screen onRefresh={() => rooms.refetch()} refreshing={rooms.isRefetching}>
      <PageHeader
        back="/buildings"
        title={building.name}
        subtitle={[building.address, building.city, `${building.floors} floors`].filter(Boolean).join(' · ')}
        actions={
          can('space.manage') ? (
            <>
              <Button title="Edit" icon="edit" variant="secondary" size="sm" onPress={() => setEditing(true)} disabled={!online} />
              <Button title="Delete" icon="delete-outline" variant="danger" size="sm" onPress={() => setDeleting(true)} disabled={!online} />
              <Button title="New room" icon="add" size="sm" onPress={() => setCreating(true)} disabled={!online} />
            </>
          ) : null
        }
      />
      {!rs.length ? <EmptyState icon="meeting-room" title="No rooms yet" message="Rooms group devices and power the 3D view." /> : null}
      {floors.map((f) => (
        <View key={f} style={{ gap: 12 }}>
          <Text style={type.caption}>Floor {f}</Text>
          <Grid min={300}>
            {rs
              .filter((r) => r.floor === f)
              .map((r) => {
                const ds = (devices.data ?? []).filter((d) => d.room_id === r.id);
                const temp = ds.find((d) => typeof d.reported_state?.temperature === 'number' && d.status === 'online')?.reported_state.temperature;
                const occ = ds.find((d) => d.type === 'occupancy_sensor')?.reported_state;
                const off = ds.filter((d) => d.status === 'offline').length;
                return (
                  <Card key={r.id} onPress={() => router.push(`/rooms/${r.id}`)} style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="meeting-room" size={20} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={type.h3} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <Text style={type.small}>
                          {ROOM_KIND_LABEL[r.kind]} · {r.width_m}×{r.depth_m} m
                        </Text>
                      </View>
                      {off ? <Badge label={`${off} offline`} tone="danger" dot /> : null}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <Text style={type.small}>🌡 {formatTemp(temp)}</Text>
                      <Text style={type.small}>👥 {occ ? `${occ.count} people` : '—'}</Text>
                      <Text style={type.small}>🎯 {formatTemp(r.target_temperature)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {ds.map((d) => (
                        <DeviceGlyph key={d.id} type={d.type} size={28} dim={d.status === 'offline'} />
                      ))}
                      {!ds.length ? <Text style={type.small}>No devices</Text> : null}
                    </View>
                  </Card>
                );
              })}
          </Grid>
        </View>
      ))}
      <RoomForm key={`new-${creating}`} visible={creating} onClose={() => setCreating(false)} buildingId={buildingId} />
      <BuildingForm key={`edit-${editing}`} visible={editing} onClose={() => setEditing(false)} initial={building} />
      <ConfirmDialog
        visible={deleting}
        title="Delete this building?"
        message={`${building.name}, its ${rs.length} rooms and their device assignments will be removed. Devices stay registered but become unassigned.`}
        confirmLabel="Delete building"
        destructive
        loading={remove.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
      />
    </Screen>
  );
}

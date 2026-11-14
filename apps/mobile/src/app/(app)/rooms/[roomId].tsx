import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { DeviceCard } from '@/components/devices/DeviceCard';
import { Room3DView } from '@/components/room3d/Room3DView';
import { ConfirmDialog, EmptyState, Grid, PageHeader, Screen, SkeletonCards, useIsWide } from '@/components/ui/feedback';
import { Button, Card, SectionTitle } from '@/components/ui/primitives';
import { useBuildings, useDevices, useOnline, useRooms } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { formatMetric, formatTemp, ROOM_KIND_LABEL } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { spaceService } from '@/services/db';
import { colors, type } from '@/theme';
import { RoomForm } from '@/components/spaces/SpaceForms';

export default function RoomDetail() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { org, can } = useOrg();
  const wide = useIsWide();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const rooms = useRooms();
  const buildings = useBuildings();
  const devices = useDevices();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const room = rooms.data?.find((r) => r.id === roomId);
  const building = buildings.data?.find((b) => b.id === room?.building_id);
  const ds = (devices.data ?? []).filter((d) => d.room_id === roomId);

  const remove = useMutation({
    mutationFn: () => spaceService.deleteRoom(roomId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms', org?.id] });
      qc.invalidateQueries({ queryKey: ['devices', org?.id] });
      toast.show({ title: 'Room deleted', tone: 'success' });
      router.replace(building ? `/buildings/${building.id}` : '/buildings');
    },
    onError: (e) => toast.show({ title: 'Could not delete room', message: errorMessage(e), tone: 'danger' }),
  });

  if (rooms.isLoading && !rooms.data) return <Screen><SkeletonCards count={3} /></Screen>;
  if (!room) return <Screen><EmptyState icon="meeting-room" title="Room not found" /></Screen>;

  const online_ = ds.filter((d) => d.status === 'online');
  const temps = online_.map((d) => d.reported_state?.temperature).filter((v): v is number => typeof v === 'number');
  const hums = online_.map((d) => d.reported_state?.humidity).filter((v): v is number => typeof v === 'number');
  const people = online_.filter((d) => d.type === 'occupancy_sensor').reduce((s, d) => s + Number(d.reported_state?.count ?? 0), 0);
  const watts = online_.filter((d) => d.type === 'smart_plug').reduce((s, d) => s + Number(d.reported_state?.watts ?? 0), 0);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const avgTemp = avg(temps);
  const comfort = avgTemp === null ? null : Math.abs(avgTemp - Number(room.target_temperature)) <= 1 ? 'Comfortable' : avgTemp > Number(room.target_temperature) ? 'Too warm' : 'Too cool';

  return (
    <Screen onRefresh={() => devices.refetch()} refreshing={devices.isRefetching}>
      <PageHeader
        back={building ? `/buildings/${building.id}` : '/buildings'}
        title={room.name}
        subtitle={`${building?.name ?? ''} · Floor ${room.floor} · ${ROOM_KIND_LABEL[room.kind]} · ${room.width_m}×${room.depth_m} m`}
        actions={
          can('space.manage') ? (
            <>
              <Button title="Edit" icon="edit" size="sm" variant="secondary" onPress={() => setEditing(true)} disabled={!online} />
              <Button title="Delete" icon="delete-outline" size="sm" variant="danger" onPress={() => setDeleting(true)} disabled={!online} />
              <Button title="Add device" icon="add" size="sm" onPress={() => router.push({ pathname: '/devices/add', params: { roomId: room.id } })} disabled={!online} />
            </>
          ) : null
        }
      />
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
        <View style={{ flex: wide ? 2 : undefined }}>
          <Room3DView room={room} devices={ds} height={wide ? 520 : 380} />
        </View>
        <Card style={{ flex: wide ? 1 : undefined, gap: 14 }}>
          <SectionTitle title="Room conditions" />
          {[
            ['Temperature', formatTemp(avgTemp)],
            ['Comfort target', formatTemp(room.target_temperature)],
            ['Humidity', hums.length ? formatMetric('humidity', avg(hums)) : '—'],
            ['Occupancy', `${people} ${people === 1 ? 'person' : 'people'}`],
            ['Plug load', formatMetric('power', watts)],
            ['Devices', `${online_.length}/${ds.length} online`],
          ].map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={type.small}>{k}</Text>
              <Text style={[type.body, { fontSize: 14 }]}>{v}</Text>
            </View>
          ))}
          {comfort ? (
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: comfort === 'Comfortable' ? colors.successSoft : colors.warningSoft }}>
              <Text style={[type.body, { color: comfort === 'Comfortable' ? colors.success : colors.warning, fontSize: 14 }]}>{comfort}</Text>
            </View>
          ) : null}
        </Card>
      </View>
      <SectionTitle title={`Devices in this room (${ds.length})`} />
      {!ds.length ? <EmptyState icon="developer-board" title="No devices in this room" message="Register a device by scanning its QR code or typing its claim code." /> : null}
      <Grid min={300}>
        {ds.map((d) => (
          <DeviceCard key={d.id} device={d} onPress={() => router.push(`/devices/${d.id}`)} />
        ))}
      </Grid>
      <RoomForm key={`edit-${editing}`} visible={editing} onClose={() => setEditing(false)} buildingId={room.building_id} initial={room} />
      <ConfirmDialog
        visible={deleting}
        title="Delete this room?"
        message={`${ds.length} device(s) will become unassigned. This cannot be undone.`}
        confirmLabel="Delete room"
        destructive
        loading={remove.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
      />
    </Screen>
  );
}

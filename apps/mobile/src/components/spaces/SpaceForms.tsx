import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { FormSheet } from '@/components/ui/feedback';
import { Select, TextField } from '@/components/ui/forms';
import { Button } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { ROOM_KIND_LABEL } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { spaceService } from '@/services/db';
import type { Room, RoomKind } from '@/types/db';

export function BuildingForm({ visible, onClose, initial }: { visible: boolean; onClose: () => void; initial?: { id: string; name: string; address: string; city: string; floors: number } }) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [floors, setFloors] = useState(String(initial?.floors ?? 1));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async () => {
      const f = parseInt(floors, 10);
      const next: Record<string, string> = {};
      if (name.trim().length < 2) next.name = 'Give the building a name.';
      if (!Number.isFinite(f) || f < 1 || f > 200) next.floors = 'Floors must be between 1 and 200.';
      setErrors(next);
      if (Object.keys(next).length) throw new Error('validation');
      const input = { name: name.trim(), address: address.trim(), city: city.trim(), floors: f };
      return initial ? spaceService.updateBuilding(initial.id, input) : spaceService.createBuilding({ ...input, org_id: org!.id });
    },
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['buildings', org?.id] });
      toast.show({ title: initial ? 'Building updated' : 'Building created', message: b.name, tone: 'success' });
      onClose();
    },
    onError: (e) => {
      if (errorMessage(e) !== 'validation') toast.show({ title: 'Could not save building', message: errorMessage(e), tone: 'danger' });
    },
  });

  return (
    <FormSheet visible={visible} title={initial ? 'Edit building' : 'New building'} onClose={onClose}>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. North Campus" error={errors.name} />
      <TextField label="Street address" value={address} onChangeText={setAddress} placeholder="100 Main Street" autoComplete="street-address" />
      <TextField label="City" value={city} onChangeText={setCity} placeholder="Chicago, IL" />
      <TextField label="Floors" value={floors} onChangeText={setFloors} keyboardType="number-pad" error={errors.floors} />
      <Button title={initial ? 'Save changes' : 'Create building'} onPress={() => save.mutate()} loading={save.isPending} size="lg" />
    </FormSheet>
  );
}

export function RoomForm({ visible, onClose, buildingId, initial }: { visible: boolean; onClose: () => void; buildingId: string; initial?: Room }) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<RoomKind>(initial?.kind ?? 'office');
  const [floor, setFloor] = useState(String(initial?.floor ?? 1));
  const [width, setWidth] = useState(String(initial?.width_m ?? 8));
  const [depth, setDepth] = useState(String(initial?.depth_m ?? 6));
  const [target, setTarget] = useState(String(initial?.target_temperature ?? 21.5));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async () => {
      const w = Number(width);
      const d = Number(depth);
      const t = Number(target);
      const next: Record<string, string> = {};
      if (name.trim().length < 2) next.name = 'Give the room a name.';
      if (!(w >= 3 && w <= 40)) next.width = '3–40 m';
      if (!(d >= 3 && d <= 40)) next.depth = '3–40 m';
      if (!(t >= 10 && t <= 32)) next.target = '10–32 °C';
      setErrors(next);
      if (Object.keys(next).length) throw new Error('validation');
      const input = { name: name.trim(), kind, floor: parseInt(floor, 10) || 1, width_m: w, depth_m: d, target_temperature: t };
      return initial ? spaceService.updateRoom(initial.id, input) : spaceService.createRoom({ ...input, org_id: org!.id, building_id: buildingId });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['rooms', org?.id] });
      toast.show({ title: initial ? 'Room updated' : 'Room created', message: r.name, tone: 'success' });
      onClose();
    },
    onError: (e) => {
      if (errorMessage(e) !== 'validation') toast.show({ title: 'Could not save room', message: errorMessage(e), tone: 'danger' });
    },
  });

  return (
    <FormSheet visible={visible} title={initial ? 'Edit room' : 'New room'} onClose={onClose}>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Conference Room 4B" error={errors.name} />
      <Select
        label="Room type"
        value={kind}
        onChange={(v) => setKind(v as RoomKind)}
        options={(Object.keys(ROOM_KIND_LABEL) as RoomKind[]).map((k) => ({ value: k, label: ROOM_KIND_LABEL[k] }))}
      />
      <TextField label="Floor" value={floor} onChangeText={setFloor} keyboardType="number-pad" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <TextField label="Width (m)" value={width} onChangeText={setWidth} keyboardType="decimal-pad" error={errors.width} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Depth (m)" value={depth} onChangeText={setDepth} keyboardType="decimal-pad" error={errors.depth} />
        </View>
      </View>
      <TextField label="Comfort target (°C)" value={target} onChangeText={setTarget} keyboardType="decimal-pad" error={errors.target} hint="Used by the 3D heatmap and comfort indicators." />
      <Button title={initial ? 'Save changes' : 'Create room'} onPress={() => save.mutate()} loading={save.isPending} size="lg" />
    </FormSheet>
  );
}


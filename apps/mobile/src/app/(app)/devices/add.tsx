import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { DeviceGlyph } from '@/components/devices/DeviceCard';
import { RequirePermission } from '@/components/navigation/RequirePermission';
import { Banner, PageHeader, Screen } from '@/components/ui/feedback';
import { Segmented, Select, TextField } from '@/components/ui/forms';
import { Badge, Button, Card, Icon, Row } from '@/components/ui/primitives';
import { useBuildings, useOnline, useRooms } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { DEMO_CLAIM_CODES } from '@/lib/demo';
import { DEVICE_LABEL } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { deviceApi } from '@/services/device-api';
import { colors, font, radius, type } from '@/theme';
import type { DeviceType } from '@/types/db';


function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  if (!permission) return <View style={styles.camera} />;
  if (!permission.granted) {
    return (
      <View style={[styles.camera, styles.cameraEmpty]}>
        <Icon name="photo-camera" size={36} color={colors.primary} />
        <Text style={[type.body, { textAlign: 'center' }]}>Allow camera access to scan the QR code on the device label.</Text>
        <Button title={permission.canAskAgain ? 'Allow camera' : 'Camera blocked — use manual code'} onPress={requestPermission} disabled={!permission.canAskAgain} />
      </View>
    );
  }
  return (
    <View style={styles.camera}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={
          locked
            ? undefined
            : ({ data }) => {
                setLocked(true);
                if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
                onCode(data);
                setTimeout(() => setLocked(false), 2500);
              }
        }
      />
      <View style={styles.reticle} pointerEvents="none" />
      <Text style={styles.cameraHint}>Point at the QR code on the device or its box</Text>
    </View>
  );
}

function AddDeviceInner() {
  const params = useLocalSearchParams<{ roomId?: string; code?: string }>();
  const { org } = useOrg();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const rooms = useRooms();
  const buildings = useBuildings();
  const [method, setMethod] = useState<'scan' | 'manual'>(Platform.OS === 'web' ? 'manual' : 'scan');
  const [code, setCode] = useState(params.code ?? '');
  const [found, setFound] = useState<{ serial: string; type: DeviceType; model: string; firmware_version: string; code: string } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState(params.roomId ?? '');
  const [name, setName] = useState('');
  const [roomError, setRoomError] = useState<string | null>(null);

  const roomOptions = useMemo(
    () => (rooms.data ?? []).map((r) => ({ value: r.id, label: r.name, description: `${buildings.data?.find((b) => b.id === r.building_id)?.name ?? ''} · Floor ${r.floor}`, icon: 'meeting-room' as const })),
    [rooms.data, buildings.data],
  );

  const lookup = useMutation({
    mutationFn: (c: string) => deviceApi.lookup(c),
    onSuccess: (res, c) => {
      setFound({ ...res, code: c });
      setLookupError(null);
      setName(`${DEVICE_LABEL[res.type]} ${res.serial.slice(-4)}`);
    },
    onError: (e) => {
      setFound(null);
      setLookupError(errorMessage(e));
    },
  });

  const claim = useMutation({
    mutationFn: () => {
      if (!roomId) {
        setRoomError('Choose the room where the device is installed.');
        throw new Error('validation');
      }
      return deviceApi.claim(org!.id, found!.code, roomId, name);
    },
    onSuccess: ({ device }) => {
      qc.invalidateQueries({ queryKey: ['devices', org?.id] });
      toast.show({ title: 'Device registered', message: `${device.name} is online and reporting.`, tone: 'success' });
      router.replace(`/devices/${device.id}`);
    },
    onError: (e) => {
      if (errorMessage(e) !== 'validation') toast.show({ title: 'Could not register device', message: errorMessage(e), tone: 'danger' });
    },
  });

  const submitCode = (c: string) => {
    const v = c.trim();
    if (v.length < 4) return setLookupError('Enter the claim code printed on the device label.');
    setCode(v.replace(/^.*code=/i, ''));
    lookup.mutate(v);
  };

  return (
    <Screen maxWidth={760}>
      <PageHeader back="/devices" title="Add a device" subtitle="Thermostats, smart plugs, and temperature, humidity or occupancy sensors" />
      {!online ? <Banner tone="warning" icon="cloud-off" title="You are offline" message="Registering a device needs a connection to the ACME device registry." /> : null}

      <Card style={{ gap: 14 }}>
        <Row gap={10}>
          <View style={styles.step}>
            <Text style={styles.stepText}>1</Text>
          </View>
          <Text style={type.h3}>Identify the device</Text>
        </Row>
        <Segmented
          value={method}
          onChange={setMethod}
          options={[
            { value: 'scan', label: 'Scan QR code' },
            { value: 'manual', label: 'Enter code' },
          ]}
        />
        {method === 'scan' ? (
          <Scanner onCode={submitCode} />
        ) : (
          <View style={{ gap: 12 }}>
            <TextField
              label="Claim code"
              icon="vpn-key"
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder="ACME-XXXX-XXXX"
              autoCapitalize="characters"
              autoCorrect={false}
              error={lookupError}
              onSubmitEditing={() => submitCode(code)}
              returnKeyType="search"
            />
            <Button title="Look up device" icon="search" onPress={() => submitCode(code)} loading={lookup.isPending} disabled={!online} />
            <View style={{ gap: 6 }}>
              <Text style={type.caption}>Demo devices waiting to be claimed</Text>
              <Row wrap gap={6}>
                {DEMO_CLAIM_CODES.map((c) => (
                  <Text key={c} onPress={() => (setCode(c), submitCode(c))} style={styles.demoCode} accessibilityRole="button">
                    {c}
                  </Text>
                ))}
              </Row>
            </View>
          </View>
        )}
        {method === 'scan' && lookupError ? <Banner tone="danger" title={lookupError} /> : null}
        {method === 'scan' && lookup.isPending ? <Text style={type.small}>Looking up device…</Text> : null}
      </Card>

      {found ? (
        <Card style={{ gap: 14 }}>
          <Row gap={10}>
            <View style={styles.step}>
              <Text style={styles.stepText}>2</Text>
            </View>
            <Text style={type.h3}>Place and name it</Text>
          </Row>
          <View style={styles.found}>
            <DeviceGlyph type={found.type} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontFamily: font.semibold }]}>{found.model}</Text>
              <Text style={type.small}>
                {DEVICE_LABEL[found.type]} · Serial {found.serial} · Firmware {found.firmware_version}
              </Text>
            </View>
            <Badge label="Verified" tone="success" icon="verified" />
          </View>
          <TextField label="Device name" value={name} onChangeText={setName} placeholder="e.g. Reception Thermostat" />
          <Select label="Room" value={roomId} onChange={(v) => (setRoomId(v), setRoomError(null))} options={roomOptions} placeholder="Choose a room" error={roomError} />
          <Button title="Register device" icon="add-circle" size="lg" onPress={() => claim.mutate()} loading={claim.isPending} disabled={!online} />
        </Card>
      ) : null}
    </Screen>
  );
}

export default function AddDevice() {
  return (
    <RequirePermission action="device.manage">
      <AddDeviceInner />
    </RequirePermission>
  );
}

const styles = StyleSheet.create({
  camera: { height: 320, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  cameraEmpty: { backgroundColor: colors.surfaceAlt, gap: 12, padding: 24 },
  reticle: { width: 200, height: 200, borderRadius: 24, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  cameraHint: { position: 'absolute', bottom: 16, color: '#fff', fontFamily: font.medium, fontSize: 13, backgroundColor: 'rgba(15,23,42,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  step: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#fff', fontFamily: font.bold, fontSize: 13 },
  found: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.successSoft },
  demoCode: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12.5,
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
});

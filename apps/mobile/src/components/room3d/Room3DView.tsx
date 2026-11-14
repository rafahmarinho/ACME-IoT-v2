import { router } from 'expo-router';
import { Component, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { DEVICE_LABEL, primaryReading } from '@/lib/format';
import { colors, font, radius, shadow, type } from '@/theme';
import type { Device, Room } from '@/types/db';
import { DEVICE_COLOR, DeviceGlyph, StatusBadge } from '../devices/DeviceCard';
import { Segmented } from '../ui/forms';
import { Button, Icon, type IconName } from '../ui/primitives';
import { RoomCanvas, SHADOWS_SUPPORTED } from './RoomCanvas';
import { RoomScene, type CameraState } from './RoomScene';

class GLBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const DEFAULT_CAM: CameraState = { azimuth: Math.PI / 4, elevation: 0.72, zoom: 1.05 };

function ToolButton({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.tool, active && { backgroundColor: colors.primary }]}>
      <Icon name={icon} size={20} color={active ? '#fff' : colors.text} />
    </Pressable>
  );
}

/** Top-down 2D floor plan — used as a fallback and as an alternate view. */
export function FloorPlan({ room, devices, selectedId, onSelect }: { room: Room; devices: Device[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const ratio = Number(room.width_m) / Number(room.depth_m);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <View style={[styles.plan, { aspectRatio: ratio, maxHeight: '100%' }]}>
        <Text style={styles.planDims}>
          {room.width_m} m × {room.depth_m} m
        </Text>
        {devices.map((d) => {
          const c = DEVICE_COLOR[d.type];
          const sel = d.id === selectedId;
          return (
            <Pressable
              key={d.id}
              onPress={() => onSelect(d.id)}
              accessibilityLabel={`${d.name}, ${d.status}`}
              style={[
                styles.planDot,
                {
                  left: `${Math.min(94, Math.max(2, Number(d.position_x) * 100 - 3))}%`,
                  top: `${Math.min(92, Math.max(2, Number(d.position_z) * 100 - 4))}%`,
                  backgroundColor: d.status === 'offline' ? colors.dangerSoft : c.bg,
                  borderColor: sel ? colors.primary : d.status === 'offline' ? colors.danger : '#fff',
                },
              ]}
            >
              <DeviceGlyph type={d.type} size={26} dim={d.status === 'offline'} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Room3DView({ room, devices, height = 420, compact }: { room: Room; devices: Device[]; height?: number; compact?: boolean }) {
  const [cam, setCam] = useState<CameraState>(DEFAULT_CAM);
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [heatmap, setHeatmap] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const start = useRef(cam);
  const selected = devices.find((d) => d.id === selectedId) ?? null;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          start.current = camRef.current;
        },
        onPanResponderMove: (_, g) => {
          setCam({
            ...start.current,
            azimuth: start.current.azimuth - g.dx * 0.008,
            elevation: Math.min(1.35, Math.max(0.25, start.current.elevation + g.dy * 0.005)),
          });
        },
      }),
    [],
  );
  const camRef = useRef(cam);
  camRef.current = cam;

  const zoom = (delta: number) => setCam((c) => ({ ...c, zoom: Math.min(1.8, Math.max(0.6, c.zoom + delta)) }));
  const webWheel = Platform.OS === 'web' ? ({ onWheel: (e: any) => zoom(e.deltaY > 0 ? -0.08 : 0.08) } as object) : {};

  const fallback = <FloorPlan room={room} devices={devices} selectedId={selectedId} onSelect={setSelectedId} />;

  return (
    <View style={[styles.wrap, { height }]}>
      <View style={{ flex: 1 }} {...(mode === '3d' ? pan.panHandlers : {})} {...webWheel}>
        {mode === '3d' ? (
          <GLBoundary fallback={fallback}>
            <RoomCanvas onMissed={() => setSelectedId(null)}>
              <RoomScene room={room} devices={devices} selectedId={selectedId} onSelect={setSelectedId} cam={cam} heatmap={heatmap} shadows={SHADOWS_SUPPORTED} />
            </RoomCanvas>
          </GLBoundary>
        ) : (
          fallback
        )}
      </View>

      <View style={styles.topBar} pointerEvents="box-none">
        <View style={{ width: 132 }}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: '3d', label: '3D' },
              { value: '2d', label: 'Plan' },
            ]}
          />
        </View>
        {mode === '3d' ? (
          <View style={styles.tools}>
            <ToolButton icon="thermostat" label="Toggle temperature heatmap" onPress={() => setHeatmap((h) => !h)} active={heatmap} />
            <ToolButton icon="zoom-in" label="Zoom in" onPress={() => zoom(0.15)} />
            <ToolButton icon="zoom-out" label="Zoom out" onPress={() => zoom(-0.15)} />
            <ToolButton icon="360" label="Reset view" onPress={() => setCam(DEFAULT_CAM)} />
          </View>
        ) : null}
      </View>

      {heatmap && mode === '3d' ? (
        <View style={styles.legend} pointerEvents="none">
          <Text style={styles.legendText}>17°</Text>
          <View style={styles.legendBar}>
            {['#3B82F6', '#10B981', '#F59E0B', '#EF4444'].map((c) => (
              <View key={c} style={{ flex: 1, backgroundColor: c }} />
            ))}
          </View>
          <Text style={styles.legendText}>28°C</Text>
        </View>
      ) : !compact && !selected ? (
        <View style={styles.hint} pointerEvents="none">
          <Icon name="touch-app" size={14} color={colors.textMuted} />
          <Text style={styles.hintText}>{mode === '3d' ? 'Drag to orbit · tap a device' : 'Tap a device'}</Text>
        </View>
      ) : null}

      {selected ? (
        <View style={styles.detail}>
          <DeviceGlyph type={selected.type} size={40} dim={selected.status === 'offline'} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.body, { fontFamily: font.semibold }]} numberOfLines={1}>
              {selected.name}
            </Text>
            <Text style={type.small} numberOfLines={1}>
              {DEVICE_LABEL[selected.type]} · {primaryReading(selected).value} · {primaryReading(selected).label}
            </Text>
          </View>
          <StatusBadge device={selected} />
          <Button title="Open" size="sm" variant="subtle" icon="open-in-new" onPress={() => router.push(`/devices/${selected.id}`)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#EEF0F7', borderWidth: 1, borderColor: colors.border },
  topBar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tools: { gap: 8 },
  tool: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center', ...shadow },
  legend: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  legendBar: { width: 120, height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  legendText: { fontFamily: font.semibold, fontSize: 11, color: colors.textMuted },
  hint: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  hintText: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  detail: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  plan: { width: '100%', borderRadius: 12, borderWidth: 6, borderColor: '#CBD2E1', backgroundColor: '#FBFAF7' },
  planDims: { position: 'absolute', bottom: 6, right: 10, fontFamily: font.medium, fontSize: 11, color: colors.textSubtle },
  planDot: { position: 'absolute', padding: 3, borderRadius: 12, borderWidth: 2, ...shadow },
});

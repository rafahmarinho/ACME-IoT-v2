import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Device, Room } from '@/types/db';
import { DeviceModel, placeDevice } from './DeviceModels';
import { Floor, Furniture, People, Walls } from './models';

export interface CameraState {
  azimuth: number; // radians around Y
  elevation: number; // radians above the floor
  zoom: number; // 0.6 – 1.8
}

function CameraRig({ cam, size }: { cam: CameraState; size: number }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(0, 0.9, 0));
  useFrame(() => {
    const dist = size * 1.25 * (2.2 - cam.zoom);
    const desired = new THREE.Vector3(
      Math.sin(cam.azimuth) * Math.cos(cam.elevation) * dist,
      Math.sin(cam.elevation) * dist + 0.6,
      Math.cos(cam.azimuth) * Math.cos(cam.elevation) * dist,
    );
    camera.position.lerp(desired, 0.12);
    camera.lookAt(target.current);
  });
  return null;
}

function tempColor(t: number) {
  // 17 °C blue → 22 °C green → 28 °C red
  const stops: [number, THREE.Color][] = [
    [17, new THREE.Color('#3B82F6')],
    [21, new THREE.Color('#10B981')],
    [24, new THREE.Color('#F59E0B')],
    [28, new THREE.Color('#EF4444')],
  ];
  if (t <= stops[0][0]) return stops[0][1].clone();
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (t <= b) return ca.clone().lerp(cb, (t - a) / (b - a));
  }
  return stops[stops.length - 1][1].clone();
}

/** Inverse-distance-weighted temperature field painted on the floor. */
function Heatmap({ devices, width, depth }: { devices: Device[]; width: number; depth: number }) {
  const geometry = useMemo(() => {
    const sources = devices
      .filter((d) => d.status === 'online' && typeof d.reported_state?.temperature === 'number')
      .map((d) => {
        const p = placeDevice(d, width, depth);
        return { x: p.pos[0], z: p.pos[2], t: Number(d.reported_state.temperature) };
      });
    const g = new THREE.PlaneGeometry(width, depth, 28, 28);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let t = 21;
      if (sources.length) {
        let wsum = 0;
        let tsum = 0;
        for (const s of sources) {
          const w = 1 / Math.max(0.2, (s.x - x) ** 2 + (s.z - z) ** 2);
          wsum += w;
          tsum += w * s.t;
        }
        t = tsum / wsum;
      }
      const c = tempColor(t);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [devices, width, depth]);

  return (
    <mesh geometry={geometry} position={[0, 0.03, 0]}>
      <meshBasicMaterial vertexColors transparent opacity={0.42} depthWrite={false} />
    </mesh>
  );
}

export function RoomScene({
  room,
  devices,
  selectedId,
  onSelect,
  cam,
  heatmap,
  shadows,
}: {
  room: Room;
  devices: Device[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  cam: CameraState;
  heatmap: boolean;
  shadows: boolean;
}) {
  const width = Number(room.width_m);
  const depth = Number(room.depth_m);
  const occupancy = devices.filter((d) => d.type === 'occupancy_sensor' && d.status === 'online').reduce((m, d) => Math.max(m, Number(d.reported_state?.count ?? 0)), 0);

  // Hide the walls between the camera and the room (dollhouse cutaway)
  const cx = Math.sin(cam.azimuth);
  const cz = Math.cos(cam.azimuth);
  const visible = { back: cz > -0.2, front: cz < -0.2, left: cx > -0.2, right: cx < -0.2 };

  return (
    <>
      <color attach="background" args={['#EEF0F7']} />
      <fog attach="fog" args={['#EEF0F7', 30, 60]} />
      <CameraRig cam={cam} size={Math.max(width, depth)} />
      <hemisphereLight args={['#FFFFFF', '#C8BBA8', 0.85]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[width * 0.6, 9, depth * 0.8]}
        intensity={1.5}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0005}
      />
      <pointLight position={[0, 2.6, 0]} intensity={6} distance={9} color="#FFF4E0" />

      <group onPointerMissed={() => onSelect(null)}>
        <Floor width={width} depth={depth} carpet={room.kind === 'office' || room.kind === 'meeting'} />
        <Walls width={width} depth={depth} visible={visible} />
        <Furniture kind={room.kind} width={width} depth={depth} />
        {occupancy > 0 ? <People count={occupancy} width={width} depth={depth} /> : null}
        {heatmap ? <Heatmap devices={devices} width={width} depth={depth} /> : null}
        {devices.map((d) => (
          <DeviceModel key={d.id} device={d} width={width} depth={depth} selected={d.id === selectedId} onSelect={onSelect} />
        ))}
      </group>
      {/* soft ground shadow catcher outside the room */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
        <circleGeometry args={[Math.max(width, depth) * 1.4, 48]} />
        <meshStandardMaterial color="#E4E7F1" roughness={1} />
      </mesh>
    </>
  );
}

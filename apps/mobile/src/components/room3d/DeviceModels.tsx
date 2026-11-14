import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { Device } from '@/types/db';

export const WALL_HEIGHT = 2.9;

/** Converts a device's normalized room position into world coordinates and facing. */
export function placeDevice(d: Device, width: number, depth: number) {
  const x = (Number(d.position_x) - 0.5) * width;
  const z = (Number(d.position_z) - 0.5) * depth;
  if (d.mount === 'ceiling') return { pos: [x, WALL_HEIGHT - 0.04, z] as [number, number, number], rotY: 0, mount: 'ceiling' as const };
  if (d.mount === 'desk') return { pos: [x, 0.78, z] as [number, number, number], rotY: 0, mount: 'desk' as const };
  // wall / floor: snap to the nearest wall
  const dl = Number(d.position_x);
  const dr = 1 - dl;
  const db = Number(d.position_z);
  const df = 1 - db;
  const min = Math.min(dl, dr, db, df);
  const y = d.mount === 'floor' ? 0.32 : 1.45;
  if (min === dl) return { pos: [-width / 2 + 0.03, y, z] as [number, number, number], rotY: Math.PI / 2, mount: 'wall' as const };
  if (min === dr) return { pos: [width / 2 - 0.03, y, z] as [number, number, number], rotY: -Math.PI / 2, mount: 'wall' as const };
  if (min === db) return { pos: [x, y, -depth / 2 + 0.03] as [number, number, number], rotY: 0, mount: 'wall' as const };
  return { pos: [x, y, depth / 2 - 0.03] as [number, number, number], rotY: Math.PI, mount: 'wall' as const };
}

function StatusBeacon({ online, selected, warn }: { online: boolean; selected: boolean; warn: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const color = !online ? '#EF4444' : warn ? '#F59E0B' : selected ? '#4F46E5' : '#22C55E';
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.y = 0.5 + Math.sin(t * 2.4) * 0.04;
    ref.current.rotation.y = t * 1.2;
    const s = selected ? 1.35 : !online ? 1 + Math.abs(Math.sin(t * 3)) * 0.35 : 1;
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh ref={ref} position={[0, 0.42, 0]}>
      <octahedronGeometry args={[0.1, 0]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
    </mesh>
  );
}

function SelectionRing({ visible, mount }: { visible: boolean; mount: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.08;
    ref.current.scale.set(s, s, s);
  });
  if (!visible) return null;
  return (
    <mesh ref={ref} rotation={mount === 'ceiling' || mount === 'desk' ? [Math.PI / 2, 0, 0] : [0, 0, 0]} position={[0, 0, 0.02]}>
      <torusGeometry args={[0.28, 0.018, 10, 48]} />
      <meshStandardMaterial color="#4F46E5" emissive="#6366F1" emissiveIntensity={1.2} transparent opacity={0.9} />
    </mesh>
  );
}

function Thermostat({ device }: { device: Device }) {
  const r = device.reported_state ?? {};
  const ring = device.status === 'offline' ? '#6B7280' : r.hvac === 'heating' ? '#F97316' : r.hvac === 'cooling' ? '#3B82F6' : '#6366F1';
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[0.3, 0.3, 0.05]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.02, 40]} />
        <meshStandardMaterial color="#111827" roughness={0.25} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.042]}>
        <torusGeometry args={[0.1, 0.008, 8, 48]} />
        <meshStandardMaterial color={ring} emissive={ring} emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, 0, 0.041]}>
        <planeGeometry args={[0.09, 0.045]} />
        <meshStandardMaterial color={ring} emissive={ring} emissiveIntensity={0.6} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function SmartPlug({ device }: { device: Device }) {
  const on = Boolean(device.reported_state?.power) && device.status === 'online';
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[0.13, 0.18, 0.06]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.4} />
      </mesh>
      {[-0.025, 0.025].map((x) => (
        <mesh key={x} position={[x, -0.02, 0.031]}>
          <boxGeometry args={[0.012, 0.035, 0.005]} />
          <meshStandardMaterial color="#1F2937" />
        </mesh>
      ))}
      <mesh position={[0, 0.06, 0.032]}>
        <sphereGeometry args={[0.012, 12, 12]} />
        <meshStandardMaterial color={on ? '#22C55E' : '#9CA3AF'} emissive={on ? '#22C55E' : '#000000'} emissiveIntensity={on ? 2 : 0} />
      </mesh>
      {on ? (
        <mesh position={[0, 0, 0.04]}>
          <ringGeometry args={[0.1, 0.13, 32]} />
          <meshBasicMaterial color="#22C55E" transparent opacity={0.25} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
    </group>
  );
}

function SensorPuck({ device, accent }: { device: Device; accent: string }) {
  const color = device.status === 'offline' ? '#9CA3AF' : accent;
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 0.035, 32]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <circleGeometry args={[0.04, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

function OccupancyDome({ device }: { device: Device }) {
  const occupied = Boolean(device.reported_state?.occupied) && device.status === 'online';
  const cone = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (cone.current) ((cone.current.material as THREE.MeshBasicMaterial).opacity = 0.05 + Math.abs(Math.sin(clock.elapsedTime * 1.4)) * 0.05);
  });
  return (
    <group>
      <mesh rotation={[Math.PI, 0, 0]} castShadow>
        <sphereGeometry args={[0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.09, 0.01, 8, 32]} />
        <meshStandardMaterial color={occupied ? '#A855F7' : '#9CA3AF'} emissive={occupied ? '#A855F7' : '#000000'} emissiveIntensity={1.4} />
      </mesh>
      {occupied ? (
        <mesh ref={cone} position={[0, -WALL_HEIGHT / 2, 0]}>
          <coneGeometry args={[1.6, WALL_HEIGHT - 0.1, 40, 1, true]} />
          <meshBasicMaterial color="#A855F7" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

export function DeviceModel({
  device,
  width,
  depth,
  selected,
  onSelect,
}: {
  device: Device;
  width: number;
  depth: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const p = placeDevice(device, width, depth);
  const lowBattery = device.battery_level !== null && device.battery_level < 15;
  const pending = Object.keys(device.desired_state ?? {}).some((k) => JSON.stringify(device.desired_state[k]) !== JSON.stringify(device.reported_state?.[k]));
  const handle = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if ((e as any).delta > 8) return; // ignore drags
    onSelect(device.id);
  };
  const faceRot: [number, number, number] = p.mount === 'ceiling' ? [0, 0, 0] : p.mount === 'desk' ? [-Math.PI / 2, 0, 0] : [0, p.rotY, 0];

  return (
    <group position={p.pos}>
      <group rotation={faceRot} scale={1.6}>
        {device.type === 'thermostat' ? <Thermostat device={device} /> : null}
        {device.type === 'smart_plug' ? <SmartPlug device={device} /> : null}
        {device.type === 'temperature_sensor' ? <SensorPuck device={device} accent="#F97316" /> : null}
        {device.type === 'humidity_sensor' ? <SensorPuck device={device} accent="#0EA5E9" /> : null}
        {device.type === 'occupancy_sensor' ? <OccupancyDome device={device} /> : null}
        <SelectionRing visible={selected} mount={p.mount} />
      </group>
      <group position={p.mount === 'ceiling' ? [0, -0.75, 0] : [0, 0, 0]}>
        <StatusBeacon online={device.status === 'online'} selected={selected} warn={lowBattery || pending} />
      </group>
      {/* Generous invisible hit target for touch */}
      <mesh onClick={handle} position={p.mount === 'ceiling' ? [0, -0.3, 0] : [0, 0.15, 0]}>
        <sphereGeometry args={[0.38, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

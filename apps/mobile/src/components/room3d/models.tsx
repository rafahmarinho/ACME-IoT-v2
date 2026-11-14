/**
 * Procedural, low-poly 3D assets for the room view. Everything is built from
 * three.js primitives so it renders identically on web (WebGL) and native
 * (expo-gl) without loading external model files.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { RoomKind } from '@/types/db';

export const PALETTE = {
  wall: '#F3F1EC',
  wallSide: '#E9E6DF',
  trim: '#FFFFFF',
  floorA: '#C9A27A',
  floorB: '#BE956D',
  floorC: '#D2AD86',
  carpet: '#B8BCCB',
  oak: '#B98B5E',
  walnut: '#7A5534',
  metal: '#9AA3B2',
  darkMetal: '#3B4252',
  black: '#1E2230',
  fabric: '#5B6B8C',
  fabricWarm: '#C4875F',
  fabricLight: '#D9D4CB',
  leaf: '#3F8F5A',
  leafDark: '#2F6E44',
  pot: '#E8E2D8',
  glass: '#BFD9F2',
  indigo: '#4F46E5',
  white: '#FAFAFC',
};

type V3 = [number, number, number];

function Box({ size, position, color, rotation, roughness = 0.75, metalness = 0, emissive, emissiveIntensity, castShadow = true, opacity }: {
  size: V3;
  position: V3;
  color: string;
  rotation?: V3;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  castShadow?: boolean;
  opacity?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow={castShadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissiveIntensity ?? 0}
        transparent={opacity !== undefined}
        opacity={opacity ?? 1}
      />
    </mesh>
  );
}

function Cyl({ r, h, position, color, rotation, segments = 24, roughness = 0.6, metalness = 0, rTop }: { r: number; h: number; position: V3; color: string; rotation?: V3; segments?: number; roughness?: number; metalness?: number; rTop?: number }) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[rTop ?? r, r, h, segments]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Architecture
// ---------------------------------------------------------------------------
export function Floor({ width, depth, carpet }: { width: number; depth: number; carpet?: boolean }) {
  const planks = useMemo(() => {
    const rows = Math.ceil(depth / 0.22);
    const out: { z: number; color: string; offset: number }[] = [];
    const colors = [PALETTE.floorA, PALETTE.floorB, PALETTE.floorC];
    for (let i = 0; i < rows; i++) out.push({ z: -depth / 2 + 0.11 + i * 0.22, color: colors[(i * 7) % 3], offset: (i % 3) * 0.4 });
    return out;
  }, [depth]);
  return (
    <group>
      <Box size={[width + 0.24, 0.1, depth + 0.24]} position={[0, -0.06, 0]} color="#8E7358" castShadow={false} />
      {carpet ? (
        <Box size={[width, 0.02, depth]} position={[0, 0, 0]} color={PALETTE.carpet} roughness={1} castShadow={false} />
      ) : (
        planks.map((p, i) => <Box key={i} size={[width, 0.02, 0.215]} position={[0, 0, p.z]} color={p.color} roughness={0.55} castShadow={false} />)
      )}
    </group>
  );
}

export function Walls({ width, depth, visible, height = 2.9 }: { width: number; depth: number; height?: number; visible: { back: boolean; front: boolean; left: boolean; right: boolean } }) {
  const t = 0.12;
  return (
    <group>
      {visible.back ? (
        <group>
          <Box size={[width + t * 2, height, t]} position={[0, height / 2, -depth / 2 - t / 2]} color={PALETTE.wall} roughness={0.95} />
          <Box size={[width, 0.1, 0.02]} position={[0, 0.06, -depth / 2 + 0.01]} color={PALETTE.trim} />
          <Window x={width * 0.18} wallZ={-depth / 2} width={Math.min(2.6, width * 0.32)} />
        </group>
      ) : null}
      {visible.front ? <Box size={[width + t * 2, height, t]} position={[0, height / 2, depth / 2 + t / 2]} color={PALETTE.wall} roughness={0.95} /> : null}
      {visible.left ? (
        <group>
          <Box size={[t, height, depth]} position={[-width / 2 - t / 2, height / 2, 0]} color={PALETTE.wallSide} roughness={0.95} />
          <Box size={[0.02, 0.1, depth]} position={[-width / 2 + 0.01, 0.06, 0]} color={PALETTE.trim} />
        </group>
      ) : null}
      {visible.right ? <Box size={[t, height, depth]} position={[width / 2 + t / 2, height / 2, 0]} color={PALETTE.wallSide} roughness={0.95} /> : null}
    </group>
  );
}

function Window({ x, wallZ, width }: { x: number; wallZ: number; width: number }) {
  const h = 1.5;
  const y = 1.55;
  const z = wallZ + 0.015;
  return (
    <group position={[x, y, z]}>
      <Box size={[width, h, 0.02]} position={[0, 0, 0]} color={PALETTE.glass} roughness={0.1} metalness={0.2} emissive="#9CC7F0" emissiveIntensity={0.35} castShadow={false} />
      <Box size={[width + 0.1, 0.06, 0.06]} position={[0, h / 2, 0.02]} color={PALETTE.trim} />
      <Box size={[width + 0.1, 0.06, 0.08]} position={[0, -h / 2, 0.03]} color={PALETTE.trim} />
      <Box size={[0.06, h, 0.06]} position={[-width / 2, 0, 0.02]} color={PALETTE.trim} />
      <Box size={[0.06, h, 0.06]} position={[width / 2, 0, 0.02]} color={PALETTE.trim} />
      <Box size={[0.04, h, 0.04]} position={[0, 0, 0.02]} color={PALETTE.trim} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------
function Desk({ position, rotation = 0, monitor = true }: { position: V3; rotation?: number; monitor?: boolean }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Box size={[1.4, 0.04, 0.7]} position={[0, 0.74, 0]} color={PALETTE.oak} roughness={0.5} />
      {[-0.66, 0.66].map((x) => (
        <Box key={x} size={[0.04, 0.72, 0.62]} position={[x, 0.36, 0]} color={PALETTE.darkMetal} metalness={0.4} roughness={0.4} />
      ))}
      {monitor ? (
        <group position={[0, 0.76, -0.2]}>
          <Box size={[0.2, 0.015, 0.14]} position={[0, 0.01, 0]} color={PALETTE.darkMetal} metalness={0.5} />
          <Box size={[0.04, 0.24, 0.03]} position={[0, 0.13, 0]} color={PALETTE.darkMetal} metalness={0.5} />
          <Box size={[0.62, 0.36, 0.025]} position={[0, 0.38, 0.01]} color={PALETTE.black} roughness={0.3} />
          <Box size={[0.58, 0.32, 0.005]} position={[0, 0.38, 0.025]} color="#1F2A4D" emissive="#4F6BE5" emissiveIntensity={0.55} castShadow={false} />
        </group>
      ) : null}
      <Box size={[0.42, 0.015, 0.14]} position={[0, 0.77, 0.14]} color="#E5E7EB" />
    </group>
  );
}

function Chair({ position, rotation = 0, color = PALETTE.fabric }: { position: V3; rotation?: number; color?: string }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Box size={[0.48, 0.07, 0.46]} position={[0, 0.47, 0]} color={color} roughness={0.9} />
      <Box size={[0.46, 0.5, 0.06]} position={[0, 0.76, 0.21]} color={color} roughness={0.9} />
      <Cyl r={0.025} h={0.4} position={[0, 0.25, 0]} color={PALETTE.darkMetal} metalness={0.6} />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return <Box key={i} size={[0.26, 0.025, 0.035]} position={[Math.cos(a) * 0.13, 0.04, Math.sin(a) * 0.13]} rotation={[0, -a, 0]} color={PALETTE.darkMetal} metalness={0.6} />;
      })}
    </group>
  );
}

function MeetingTable({ length, position }: { length: number; position: V3 }) {
  return (
    <group position={position}>
      <Box size={[length, 0.05, 1.3]} position={[0, 0.74, 0]} color={PALETTE.walnut} roughness={0.35} />
      <Box size={[length * 0.75, 0.68, 0.3]} position={[0, 0.36, 0]} color={PALETTE.darkMetal} metalness={0.3} />
      {Array.from({ length: Math.floor(length / 0.9) }).map((_, i, arr) => {
        const x = -((arr.length - 1) * 0.9) / 2 + i * 0.9;
        return (
          <group key={i}>
            <Chair position={[x, 0, -0.95]} rotation={Math.PI} color="#3F4A66" />
            <Chair position={[x, 0, 0.95]} color="#3F4A66" />
          </group>
        );
      })}
    </group>
  );
}

function WallScreen({ width, wallZ }: { width: number; wallZ: number }) {
  return (
    <group position={[0, 1.55, wallZ + 0.05]}>
      <Box size={[width, width * 0.56, 0.05]} position={[0, 0, 0]} color={PALETTE.black} roughness={0.2} />
      <Box size={[width - 0.06, width * 0.56 - 0.06, 0.01]} position={[0, 0, 0.03]} color="#20294A" emissive="#3D4FD1" emissiveIntensity={0.7} castShadow={false} />
    </group>
  );
}

function Sofa({ position, rotation = 0, color = PALETTE.fabric, width = 2 }: { position: V3; rotation?: number; color?: string; width?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Box size={[width, 0.42, 0.9]} position={[0, 0.25, 0]} color={color} roughness={0.95} />
      <Box size={[width, 0.5, 0.22]} position={[0, 0.6, 0.34]} color={color} roughness={0.95} />
      <Box size={[0.2, 0.36, 0.9]} position={[-width / 2 + 0.1, 0.52, 0]} color={color} roughness={0.95} />
      <Box size={[0.2, 0.36, 0.9]} position={[width / 2 - 0.1, 0.52, 0]} color={color} roughness={0.95} />
      {[-width / 4, width / 4].map((x) => (
        <Box key={x} size={[width / 2 - 0.25, 0.1, 0.6]} position={[x, 0.51, -0.06]} color={color} roughness={1} />
      ))}
      {[-width / 2 + 0.1, width / 2 - 0.1].map((x) => [-0.38, 0.38].map((z) => <Cyl key={`${x}${z}`} r={0.03} h={0.05} position={[x, 0.025, z]} color={PALETTE.walnut} />))}
    </group>
  );
}

function CoffeeTable({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <Box size={[1.1, 0.04, 0.6]} position={[0, 0.42, 0]} color={PALETTE.walnut} roughness={0.35} />
      {[-0.5, 0.5].map((x) => [-0.25, 0.25].map((z) => <Cyl key={`${x}${z}`} r={0.02} h={0.4} position={[x, 0.2, z]} color={PALETTE.black} metalness={0.5} />))}
      <Cyl r={0.08} h={0.12} position={[0.25, 0.5, 0]} color="#E9E4DA" />
    </group>
  );
}

export function Plant({ position, scale = 1 }: { position: V3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <Cyl r={0.18} rTop={0.22} h={0.4} position={[0, 0.2, 0]} color={PALETTE.pot} roughness={0.8} />
      <mesh position={[0, 0.75, 0]} castShadow>
        <icosahedronGeometry args={[0.36, 0]} />
        <meshStandardMaterial color={PALETTE.leaf} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.15, 1.02, 0.05]} castShadow>
        <icosahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial color={PALETTE.leafDark} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-0.14, 0.95, -0.08]} castShadow>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color="#4FA36A" roughness={0.85} flatShading />
      </mesh>
    </group>
  );
}

function ServerRack({ position, rotation = 0 }: { position: V3; rotation?: number }) {
  const leds = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!leds.current) return;
    leds.current.children.forEach((c, i) => {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 0.6 + 0.8 * Math.max(0, Math.sin(clock.elapsedTime * (2 + (i % 5)) + i));
    });
  });
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Box size={[0.62, 2.05, 1.0]} position={[0, 1.025, 0]} color="#2E3446" roughness={0.45} metalness={0.35} />
      {Array.from({ length: 9 }).map((_, i) => (
        <Box key={i} size={[0.56, 0.16, 0.01]} position={[0, 0.25 + i * 0.2, 0.505]} color="#2A3042" metalness={0.5} roughness={0.35} castShadow={false} />
      ))}
      <group ref={leds}>
        {Array.from({ length: 18 }).map((_, i) => (
          <mesh key={i} position={[-0.22 + (i % 2) * 0.06, 0.25 + Math.floor(i / 2) * 0.2, 0.515]}>
            <boxGeometry args={[0.025, 0.025, 0.01]} />
            <meshStandardMaterial color={i % 7 === 0 ? '#F59E0B' : '#22C55E'} emissive={i % 7 === 0 ? '#F59E0B' : '#22C55E'} emissiveIntensity={1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function CracUnit({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <Box size={[0.9, 1.9, 0.7]} position={[0, 0.95, 0]} color="#DDE2EA" roughness={0.5} metalness={0.2} />
      {Array.from({ length: 6 }).map((_, i) => (
        <Box key={i} size={[0.8, 0.03, 0.01]} position={[0, 1.2 + i * 0.09, 0.355]} color="#9AA3B2" castShadow={false} />
      ))}
      <Box size={[0.2, 0.1, 0.01]} position={[0.25, 0.6, 0.355]} color="#1F2937" emissive="#38BDF8" emissiveIntensity={0.5} castShadow={false} />
    </group>
  );
}

function ReceptionDesk({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <Box size={[2.6, 1.05, 0.7]} position={[0, 0.525, 0]} color={PALETTE.white} roughness={0.4} />
      <Box size={[2.7, 0.05, 0.85]} position={[0, 1.07, 0.05]} color={PALETTE.walnut} roughness={0.3} />
      <Box size={[2.4, 0.08, 0.02]} position={[0, 0.7, 0.36]} color={PALETTE.indigo} emissive={PALETTE.indigo} emissiveIntensity={0.8} castShadow={false} />
    </group>
  );
}

function Bed({ position, rotation = 0 }: { position: V3; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Box size={[1.8, 0.3, 2.1]} position={[0, 0.2, 0]} color={PALETTE.walnut} roughness={0.5} />
      <Box size={[1.72, 0.22, 2.0]} position={[0, 0.45, 0.02]} color="#F8F7F4" roughness={0.9} />
      <Box size={[1.74, 0.06, 1.2]} position={[0, 0.58, 0.42]} color="#6366F1" roughness={0.95} />
      <Box size={[1.9, 1.0, 0.1]} position={[0, 0.6, -1.05]} color={PALETTE.fabricWarm} roughness={0.95} />
      {[-0.42, 0.42].map((x) => (
        <Box key={x} size={[0.62, 0.14, 0.36]} position={[x, 0.64, -0.75]} color="#FFFFFF" roughness={1} />
      ))}
    </group>
  );
}

function Nightstand({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <Box size={[0.5, 0.5, 0.42]} position={[0, 0.25, 0]} color={PALETTE.oak} roughness={0.5} />
      <Cyl r={0.06} h={0.3} position={[0, 0.65, 0]} color="#E5E7EB" />
      <mesh position={[0, 0.88, 0]}>
        <cylinderGeometry args={[0.1, 0.16, 0.18, 20, 1, true]} />
        <meshStandardMaterial color="#FFF7E0" emissive="#FFD58A" emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Workbench({ position, rotation = 0 }: { position: V3; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Box size={[2.2, 0.06, 0.8]} position={[0, 0.9, 0]} color="#D6D3CC" roughness={0.6} />
      {[-1.05, 1.05].map((x) => [-0.35, 0.35].map((z) => <Box key={`${x}${z}`} size={[0.05, 0.88, 0.05]} position={[x, 0.44, z]} color={PALETTE.darkMetal} metalness={0.5} />))}
      <Box size={[2.1, 0.03, 0.7]} position={[0, 0.25, 0]} color={PALETTE.darkMetal} metalness={0.3} />
      <Box size={[0.45, 0.3, 0.35]} position={[-0.6, 1.08, 0]} color="#F59E0B" roughness={0.6} />
      <Box size={[0.5, 0.18, 0.4]} position={[0.4, 1.02, -0.05]} color="#334155" roughness={0.4} />
      <Box size={[0.42, 0.12, 0.02]} position={[0.4, 1.06, 0.16]} color="#0EA5E9" emissive="#0EA5E9" emissiveIntensity={0.4} castShadow={false} />
    </group>
  );
}

function Shelf({ position, rotation = 0 }: { position: V3; rotation?: number }) {
  const colors = ['#4F46E5', '#F59E0B', '#10B981', '#EF4444', '#64748B'];
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[0.02, 0.6, 1.2, 1.8].map((y) => (
        <Box key={y} size={[1.2, 0.04, 0.36]} position={[0, y, 0]} color={PALETTE.oak} />
      ))}
      {[-0.58, 0.58].map((x) => (
        <Box key={x} size={[0.04, 1.84, 0.36]} position={[x, 0.92, 0]} color={PALETTE.oak} />
      ))}
      {Array.from({ length: 12 }).map((_, i) => (
        <Box key={i} size={[0.07, 0.3 + (i % 3) * 0.05, 0.24]} position={[-0.45 + (i % 6) * 0.16, (i < 6 ? 0.04 : 0.62) + 0.17, 0]} color={colors[i % 5]} roughness={0.8} />
      ))}
    </group>
  );
}

function Rug({ width, depth, color = '#C7CBDD' }: { width: number; depth: number; color?: string }) {
  return <Box size={[width, 0.012, depth]} position={[0, 0.016, 0]} color={color} roughness={1} castShadow={false} />;
}

/** Lays out furniture appropriate for the room type, scaled to its footprint. */
export function Furniture({ kind, width, depth }: { kind: RoomKind; width: number; depth: number }) {
  const W = width / 2;
  const D = depth / 2;
  switch (kind) {
    case 'meeting':
      return (
        <group>
          <MeetingTable length={Math.min(width - 2.6, 5.4)} position={[0, 0, 0.3]} />
          <WallScreen width={Math.min(2.2, width * 0.3)} wallZ={-D} />
          <Plant position={[W - 0.45, 0, -D + 0.45]} />
          <Plant position={[-W + 0.5, 0, D - 0.5]} scale={0.8} />
        </group>
      );
    case 'office': {
      const cols = Math.max(1, Math.floor((width - 2) / 2.2));
      const rows = Math.max(1, Math.floor((depth - 1.6) / 2.1));
      const out = [];
      for (let c = 0; c < cols; c++)
        for (let r = 0; r < rows; r++) {
          const x = -((cols - 1) * 2.2) / 2 + c * 2.2;
          const z = -((rows - 1) * 2.1) / 2 + r * 2.1 + 0.2;
          out.push(
            <group key={`${c}-${r}`}>
              <Desk position={[x, 0, z - 0.35]} />
              <Chair position={[x, 0, z + 0.3]} />
            </group>,
          );
        }
      return (
        <group>
          {out}
          <Plant position={[W - 0.5, 0, -D + 0.5]} />
          <Plant position={[-W + 0.5, 0, D - 0.5]} scale={0.9} />
          <Shelf position={[W - 0.3, 0, 0]} rotation={-Math.PI / 2} />
        </group>
      );
    }
    case 'server': {
      const n = Math.max(2, Math.floor((width - 2.2) / 0.66));
      return (
        <group>
          {Array.from({ length: n }).map((_, i) => (
            <ServerRack key={i} position={[-W + 0.9 + i * 0.66, 0, -0.4]} />
          ))}
          {Array.from({ length: n }).map((_, i) => (
            <ServerRack key={`b${i}`} position={[-W + 0.9 + i * 0.66, 0, 1.4]} rotation={Math.PI} />
          ))}
          <CracUnit position={[W - 0.6, 0, D - 0.5]} />
        </group>
      );
    }
    case 'lobby':
      return (
        <group>
          <ReceptionDesk position={[-W + 2.4, 0, -D + 1.6]} />
          <Rug width={4.4} depth={3} />
          <group position={[1.4, 0, 0.6]}>
            <Sofa position={[0, 0, 1.2]} rotation={Math.PI} color={PALETTE.fabric} width={2.4} />
            <Sofa position={[0, 0, -1.2]} color={PALETTE.fabric} width={2.4} />
            <CoffeeTable position={[0, 0, 0]} />
          </group>
          <Plant position={[W - 0.6, 0, -D + 0.6]} scale={1.3} />
          <Plant position={[-W + 0.6, 0, D - 0.6]} scale={1.2} />
          <Plant position={[W - 0.6, 0, D - 0.6]} scale={1.1} />
        </group>
      );
    case 'guest_room':
      return (
        <group>
          <Bed position={[-0.6, 0, -D + 1.2]} />
          <Nightstand position={[-1.9, 0, -D + 0.4]} />
          <Nightstand position={[0.7, 0, -D + 0.4]} />
          <Sofa position={[W - 1.2, 0, D - 1]} rotation={Math.PI} width={1.6} color={PALETTE.fabricWarm} />
          <Desk position={[W - 0.9, 0, -D + 0.5]} monitor={false} />
          <Rug width={2.6} depth={1.6} color="#D8D3C8" />
          <Plant position={[-W + 0.5, 0, D - 0.5]} scale={0.9} />
        </group>
      );
    case 'lab':
      return (
        <group>
          <Workbench position={[-0.6, 0, -0.9]} />
          <Workbench position={[-0.6, 0, 1.4]} rotation={Math.PI} />
          <Chair position={[-1.2, 0, -0.2]} color="#334155" />
          <Chair position={[0.2, 0, 0.7]} rotation={Math.PI} color="#334155" />
          <Shelf position={[W - 0.3, 0, -0.4]} rotation={-Math.PI / 2} />
          <Plant position={[W - 0.5, 0, D - 0.5]} />
        </group>
      );
    case 'lounge':
      return (
        <group>
          <Rug width={3.2} depth={2.4} color="#CFC8DD" />
          <Sofa position={[0, 0, -1.1]} width={2.4} color={PALETTE.fabricLight} />
          <Sofa position={[1.7, 0, 0.3]} rotation={-Math.PI / 2} width={1.6} color={PALETTE.fabricWarm} />
          <CoffeeTable position={[0, 0, 0.2]} />
          <Plant position={[-W + 0.5, 0, -D + 0.5]} scale={1.2} />
          <Shelf position={[-W + 0.3, 0, 0.8]} rotation={Math.PI / 2} />
        </group>
      );
    default:
      return (
        <group>
          <Shelf position={[0, 0, -D + 0.3]} />
          <Plant position={[W - 0.5, 0, D - 0.5]} />
        </group>
      );
  }
}

// ---------------------------------------------------------------------------
// People (visualize occupancy)
// ---------------------------------------------------------------------------
const SHIRTS = ['#4F46E5', '#0EA5E9', '#F97316', '#10B981', '#E11D48', '#64748B', '#A855F7', '#EAB308'];
const SKIN = ['#F1C9A5', '#D9A47E', '#A8754F', '#7C5236', '#E8B894'];

function seeded(i: number) {
  const x = Math.sin(i * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export function People({ count, width, depth }: { count: number; width: number; depth: number }) {
  const people = useMemo(
    () =>
      Array.from({ length: Math.min(count, 16) }).map((_, i) => ({
        x: (seeded(i + 1) - 0.5) * (width - 1.4),
        z: (seeded(i + 101) - 0.5) * (depth - 1.4),
        rot: seeded(i + 7) * Math.PI * 2,
        shirt: SHIRTS[i % SHIRTS.length],
        skin: SKIN[i % SKIN.length],
        h: 0.92 + seeded(i + 33) * 0.14,
      })),
    [count, width, depth],
  );
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    group.current?.children.forEach((c, i) => {
      c.position.y = Math.abs(Math.sin(clock.elapsedTime * 1.6 + i)) * 0.015;
    });
  });
  return (
    <group ref={group}>
      {people.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.rot, 0]} scale={p.h}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.5, 4, 10]} />
            <meshStandardMaterial color="#2B3348" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.08, 0]} castShadow>
            <capsuleGeometry args={[0.17, 0.42, 4, 12]} />
            <meshStandardMaterial color={p.shirt} roughness={0.85} />
          </mesh>
          <mesh position={[0, 1.6, 0]} castShadow>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color={p.skin} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

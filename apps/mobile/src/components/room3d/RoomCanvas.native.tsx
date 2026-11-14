import { Canvas } from '@react-three/fiber/native';
import type { ReactNode } from 'react';

/** iOS / Android: expo-gl backed canvas. Shadows are disabled for performance. */
export function RoomCanvas({ children, onMissed }: { children: ReactNode; onMissed?: () => void }) {
  return (
    <Canvas camera={{ position: [10, 9, 12], fov: 40, near: 0.1, far: 120 }} onPointerMissed={onMissed} style={{ flex: 1 }}>
      {children}
    </Canvas>
  );
}

export const SHADOWS_SUPPORTED = false;

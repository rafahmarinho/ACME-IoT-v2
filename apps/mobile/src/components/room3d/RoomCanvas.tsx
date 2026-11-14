import { Canvas } from '@react-three/fiber';
import type { ReactNode } from 'react';

/** Web: WebGL canvas with soft shadows. */
export function RoomCanvas({ children, onMissed }: { children: ReactNode; onMissed?: () => void }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      camera={{ position: [10, 9, 12], fov: 38, near: 0.1, far: 120 }}
      onPointerMissed={onMissed}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
    >
      {children}
    </Canvas>
  );
}

export const SHADOWS_SUPPORTED = true;

import { useRef } from 'react';
import { MeshStandardMaterial } from 'three';

import { useHideWhenViewedFromBelow } from './useHideWhenViewedFromBelow';

interface Props {
  width: number;
  depth: number;
  margin?: number;
  thickness?: number;
}

const VISIBLE_OPACITY = 0.92;

export const BuildPlate = ({ width, depth, margin = 5, thickness = 1 }: Props) => {
  const materialRef = useRef<MeshStandardMaterial>(null);
  const plateWidth = width + margin * 2;
  const plateDepth = depth + margin * 2;

  useHideWhenViewedFromBelow(materialRef, VISIBLE_OPACITY);

  return (
    <mesh position={[0, 0, -thickness / 2]} renderOrder={0}>
      <boxGeometry args={[plateWidth, plateDepth, thickness]} />
      <meshStandardMaterial
        ref={materialRef}
        color="#3d3d37"
        metalness={0.35}
        roughness={0.65}
        transparent
        opacity={VISIBLE_OPACITY}
        depthWrite={false}
      />
    </mesh>
  );
};

import { useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, LineBasicMaterial } from 'three';

import { useHideWhenViewedFromBelow } from './useHideWhenViewedFromBelow';

const GRID_DIVISIONS = 20;

const createRectGrid = (width: number, depth: number) => {
  const points: number[] = [];
  const halfW = width / 2;
  const halfD = depth / 2;
  const maxDim = Math.max(width, depth);
  const divisionsX = Math.max(2, Math.round((GRID_DIVISIONS * width) / maxDim));
  const divisionsY = Math.max(2, Math.round((GRID_DIVISIONS * depth) / maxDim));

  for (let i = 0; i <= divisionsY; i++) {
    const y = -halfD + (i / divisionsY) * depth;
    points.push(-halfW, y, 0, halfW, y, 0);
  }

  for (let i = 0; i <= divisionsX; i++) {
    const x = -halfW + (i / divisionsX) * width;
    points.push(x, -halfD, 0, x, halfD, 0);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
  return geometry;
};

interface Props {
  width: number;
  depth: number;
}

export const BuildVolumeGrid = ({ width, depth }: Props) => {
  const materialRef = useRef<LineBasicMaterial>(null);
  const geometry = useMemo(() => createRectGrid(width, depth), [width, depth]);

  useHideWhenViewedFromBelow(materialRef, 0.85);

  return (
    <lineSegments geometry={geometry} renderOrder={0}>
      <lineBasicMaterial ref={materialRef} color="#666666" transparent opacity={0.85} depthWrite={false} />
    </lineSegments>
  );
};

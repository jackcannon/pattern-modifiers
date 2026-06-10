import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';

const CURSOR_COLOR = '#f5792a';

const circlePoints = (radius: number, segments: number) => {
  const points = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    points[i * 3] = Math.cos(theta) * radius;
    points[i * 3 + 1] = Math.sin(theta) * radius;
  }
  return points;
};

const axisLine = (axis: 'x' | 'y' | 'z', length: number) => {
  const end = axis === 'x' ? [length, 0, 0] : axis === 'y' ? [0, length, 0] : [0, 0, length];
  return new Float32Array([0, 0, 0, ...end]);
};

interface Props {
  /** Reference size used to scale the cursor (typically max build volume dimension) */
  size: number;
}

export const OriginCursor = ({ size }: Props) => {
  const radius = Math.max(12, size * 0.04);
  const arm = radius * 1.15;

  const circleGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(circlePoints(radius, 48), 3));
    return geometry;
  }, [radius]);

  const xArmGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(axisLine('x', arm), 3));
    return geometry;
  }, [arm]);

  const yArmGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(axisLine('y', arm), 3));
    return geometry;
  }, [arm]);

  const zArmGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(axisLine('z', arm), 3));
    return geometry;
  }, [arm]);

  const dotRadius = radius * 0.12;

  return (
    <group renderOrder={10}>
      <lineLoop geometry={circleGeometry}>
        <lineBasicMaterial color={CURSOR_COLOR} transparent opacity={0.95} depthTest={false} />
      </lineLoop>
      <lineSegments geometry={xArmGeometry}>
        <lineBasicMaterial color={CURSOR_COLOR} transparent opacity={0.95} depthTest={false} />
      </lineSegments>
      <lineSegments geometry={yArmGeometry}>
        <lineBasicMaterial color={CURSOR_COLOR} transparent opacity={0.95} depthTest={false} />
      </lineSegments>
      <lineSegments geometry={zArmGeometry}>
        <lineBasicMaterial color={CURSOR_COLOR} transparent opacity={0.95} depthTest={false} />
      </lineSegments>
      <mesh position={[0, 0, 0]} renderOrder={11}>
        <sphereGeometry args={[dotRadius, 12, 12]} />
        <meshBasicMaterial color={CURSOR_COLOR} depthTest={false} />
      </mesh>
    </group>
  );
};

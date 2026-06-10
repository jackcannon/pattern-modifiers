import { useEffect, useMemo } from 'react';
import { useDebounce } from 'use-debounce';
import { BoxGeometry, DoubleSide, EdgesGeometry } from 'three';

import { FormObject } from '../form/schema';
import { generateGeometry } from '../generate/generate';

import { BuildPlate } from './BuildPlate';
import { BuildVolumeGrid } from './BuildVolumeGrid';
import { OriginCursor } from './OriginCursor';

interface Props {
  form: FormObject;
}

export const PatternModel = ({ form }: Props) => {
  const [debouncedForm] = useDebounce(form, 150);

  const geometry = useMemo(
    () => generateGeometry(debouncedForm, debouncedForm.previewResolution),
    [debouncedForm]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const buildVolumeEdges = useMemo(
    () => new EdgesGeometry(new BoxGeometry(debouncedForm.width, debouncedForm.depth, debouncedForm.height)),
    [debouncedForm.width, debouncedForm.depth, debouncedForm.height]
  );
  useEffect(() => () => buildVolumeEdges.dispose(), [buildVolumeEdges]);

  const cursorSize = Math.max(debouncedForm.width, debouncedForm.height, debouncedForm.depth);

  return (
    <>
      <BuildPlate width={debouncedForm.width} depth={debouncedForm.depth} />

      <group position={[0, 0, 0.01]}>
        <BuildVolumeGrid width={debouncedForm.width} depth={debouncedForm.depth} />
      </group>

      <OriginCursor size={cursorSize} />

      <mesh geometry={geometry} renderOrder={1}>
        <meshStandardMaterial
          color="#FFDC00"
          flatShading
          metalness={0.1}
          roughness={0.7}
          transparent
          opacity={0.5}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      {/* build volume outline (excludes overflow) */}
      <lineSegments geometry={buildVolumeEdges} position={[0, 0, debouncedForm.height / 2]} renderOrder={2}>
        <lineBasicMaterial color="#888888" transparent opacity={0.6} depthWrite={false} />
      </lineSegments>
    </>
  );
};

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLoader } from '@react-three/fiber';
import { DoubleSide, BufferGeometry } from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { PatternField } from '../generate/patternField';
import { FormObject } from '../form/schema';

import { DEMO_OBJ_PATHS, DEMO_STL_PATHS, isObjDemoModel, isStlDemoModel, ObjDemoModelType, StlDemoModelType } from './demoModelAssets';
import { extractMeshGeometry } from './demoModels';
import { clipPreparedDemoMesh, DemoClipResult, DemoClipReuse } from './demoClip';
import { getCachedPreparedDemoMesh } from './demoMeshCache';

interface Props {
  form: FormObject;
  patternField: PatternField;
}

const INSIDE_COLOR = '#FFDC00';
const OUTSIDE_COLOR = '#5B8DEF';

const ClippedMesh = ({ geometry, color }: { geometry: BufferGeometry; color: string }) => (
  <mesh geometry={geometry} renderOrder={2}>
    <meshStandardMaterial
      color={color}
      flatShading
      metalness={0.15}
      roughness={0.55}
      side={DoubleSide}
      polygonOffset
      polygonOffsetFactor={color === INSIDE_COLOR ? -1 : 1}
      polygonOffsetUnits={1}
    />
  </mesh>
);

const DemoModelInner = ({
  form,
  patternField,
  externalSource
}: Props & { externalSource?: BufferGeometry }) => {
  const deferredField = useDeferredValue(patternField);
  const [clipResult, setClipResult] = useState<DemoClipResult | null>(null);
  const reuseRef = useRef<DemoClipReuse>({ inside: null, outside: null });

  const preparedMesh = useMemo(
    () =>
      getCachedPreparedDemoMesh(form.demoModel, form.demoSize, deferredField.maxCellSize, externalSource),
    [form.demoModel, form.demoSize, deferredField.maxCellSize, externalSource]
  );

  useEffect(() => {
    let cancelled = false;
    const idleId = requestIdleCallback(
      () => {
        if (cancelled) return;

        try {
          const clipped = clipPreparedDemoMesh(preparedMesh, deferredField, reuseRef.current);
          reuseRef.current = clipped;
          if (!cancelled) setClipResult(clipped);
        } catch (error) {
          console.error('Demo mode clipping failed:', error);
          if (!cancelled) setClipResult({ inside: null, outside: null });
        }
      },
      { timeout: 100 }
    );

    return () => {
      cancelled = true;
      cancelIdleCallback(idleId);
    };
  }, [preparedMesh, deferredField]);

  useEffect(
    () => () => {
      reuseRef.current.inside?.dispose();
      reuseRef.current.outside?.dispose();
    },
    []
  );

  const { inside, outside } = clipResult ?? { inside: null, outside: null };

  return (
    <>
      {outside && <ClippedMesh geometry={outside} color={OUTSIDE_COLOR} />}
      {inside && <ClippedMesh geometry={inside} color={INSIDE_COLOR} />}
    </>
  );
};

const ObjLoadedDemoModel = ({ model, ...props }: Props & { model: ObjDemoModelType }) => {
  const obj = useLoader(OBJLoader, DEMO_OBJ_PATHS[model]);
  const externalSource = useMemo(() => extractMeshGeometry(obj), [obj]);

  return <DemoModelInner {...props} externalSource={externalSource} />;
};

const StlLoadedDemoModel = ({ model, ...props }: Props & { model: StlDemoModelType }) => {
  const stl = useLoader(STLLoader, DEMO_STL_PATHS[model]);
  const externalSource = useMemo(() => mergeVertices(stl), [stl]);

  return <DemoModelInner {...props} externalSource={externalSource} />;
};

export const DemoModel = (props: Props) => {
  const { demoModel } = props.form;

  if (isObjDemoModel(demoModel)) return <ObjLoadedDemoModel {...props} model={demoModel} />;
  if (isStlDemoModel(demoModel)) return <StlLoadedDemoModel {...props} model={demoModel} />;
  return <DemoModelInner {...props} />;
};

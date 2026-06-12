import { useEffect, useMemo, useState } from 'react';
import { useLoader } from '@react-three/fiber';
import { useDebounce } from 'use-debounce';
import { DoubleSide, BufferGeometry } from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { PatternField } from '../generate/patternField';
import { FormObject } from '../form/schema';

import { DEMO_OBJ_PATHS, DEMO_STL_PATHS, isObjDemoModel, isStlDemoModel, ObjDemoModelType, StlDemoModelType } from './demoModelAssets';
import { createDemoGeometry, extractMeshGeometry } from './demoModels';
import { clipDemoWithField, DemoClipResult } from './demoClip';

interface Props {
  form: FormObject;
  patternField: PatternField;
}

const INSIDE_COLOR = '#FFDC00';
const OUTSIDE_COLOR = '#5B8DEF';

const ClippedMesh = ({ geometry, color }: { geometry: BufferGeometry; color: string }) => {
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
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
};

const DemoModelInner = ({
  form,
  patternField,
  externalSource
}: Props & { externalSource?: BufferGeometry }) => {
  const [debouncedForm] = useDebounce(form, 150);
  const [clipResult, setClipResult] = useState<DemoClipResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    let demoGeometry: BufferGeometry | null = null;

    try {
      demoGeometry = createDemoGeometry(debouncedForm.demoModel, debouncedForm.demoSize, externalSource);
      const clipped = clipDemoWithField(demoGeometry, patternField);
      if (!cancelled) setClipResult(clipped);
    } catch (error) {
      console.error('Demo mode clipping failed:', error);
      if (!cancelled) setClipResult({ inside: null, outside: null });
    } finally {
      demoGeometry?.dispose();
    }

    return () => {
      cancelled = true;
    };
  }, [debouncedForm.demoModel, debouncedForm.demoSize, patternField, externalSource]);

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
  const externalSource = useLoader(STLLoader, DEMO_STL_PATHS[model]);

  return <DemoModelInner {...props} externalSource={externalSource} />;
};

export const DemoModel = (props: Props) => {
  const { demoModel } = props.form;

  if (isObjDemoModel(demoModel)) return <ObjLoadedDemoModel {...props} model={demoModel} />;
  if (isStlDemoModel(demoModel)) return <StlLoadedDemoModel {...props} model={demoModel} />;
  return <DemoModelInner {...props} />;
};

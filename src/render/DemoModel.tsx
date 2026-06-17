import { useEffect, useMemo, useRef, useState } from 'react';
import { useLoader } from '@react-three/fiber';
import { BufferGeometry, DoubleSide, MeshStandardMaterial } from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { PatternField } from '../generate/patternField';
import { FormObject } from '../form/schema';

import { DEMO_OBJ_PATHS, DEMO_STL_PATHS, isObjDemoModel, isStlDemoModel, ObjDemoModelType, StlDemoModelType } from './demoModelAssets';
import { extractMeshGeometry } from './demoModels';
import { clipPreparedDemoMesh, DemoClipResult, DemoClipReuse } from './demoClip';
import { getCachedPreparedDemoMesh } from './demoMeshCache';
import { getMergedStlGeometry } from './demoStlCache';

interface Props {
  form: FormObject;
  patternField: PatternField;
}

const INSIDE_COLOR = '#FFDC00';
const OUTSIDE_COLOR = '#0074d9';

const insideMaterial = new MeshStandardMaterial({
  color: INSIDE_COLOR,
  flatShading: true,
  metalness: 0.15,
  roughness: 0.55,
  side: DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: 1,
  transparent: false,
  opacity: 1,
  depthWrite: true
});

const outsideMaterial = new MeshStandardMaterial({
  color: OUTSIDE_COLOR,
  flatShading: true,
  metalness: 0.15,
  roughness: 0.55,
  side: DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
  transparent: true,
  opacity: 0.6,
  depthWrite: false
});

const ClippedMesh = ({
  geometry,
  material,
  renderOrder
}: {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  renderOrder: number;
}) => <mesh geometry={geometry} renderOrder={renderOrder} material={material} />;

const DemoModelInner = ({
  form,
  patternField,
  externalSource
}: Props & { externalSource?: BufferGeometry }) => {
  const [preparedMesh, setPreparedMesh] = useState<BufferGeometry | null>(null);
  const [clipResult, setClipResult] = useState<DemoClipResult | null>(null);
  const reuseRef = useRef<DemoClipReuse>({ inside: null, outside: null });

  useEffect(() => {
    let cancelled = false;

    try {
      const prepared = getCachedPreparedDemoMesh(
        form.demoModel,
        form.demoSize,
        patternField.maxCellSize,
        externalSource
      );
      if (!cancelled) setPreparedMesh(prepared);
    } catch (error) {
      console.error('Demo mesh preparation failed:', error);
      if (!cancelled) setPreparedMesh(null);
    }

    return () => {
      cancelled = true;
    };
  }, [form.demoModel, form.demoSize, patternField.maxCellSize, externalSource]);

  useEffect(() => {
    if (!preparedMesh) {
      setClipResult(null);
      return;
    }

    try {
      const clipped = clipPreparedDemoMesh(preparedMesh, patternField, reuseRef.current);
      reuseRef.current = clipped;
      setClipResult(clipped);
    } catch (error) {
      console.error('Demo mode clipping failed:', error);
      setClipResult({ inside: null, outside: null });
    }
  }, [preparedMesh, patternField.iso, patternField.solidHigh, patternField.clipRuntime]);

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
      {outside && <ClippedMesh geometry={outside} material={outsideMaterial} renderOrder={1} />}
      {inside && <ClippedMesh geometry={inside} material={insideMaterial} renderOrder={2} />}
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
  const externalSource = useMemo(() => getMergedStlGeometry(DEMO_STL_PATHS[model], stl), [model, stl]);

  return <DemoModelInner {...props} externalSource={externalSource} />;
};

export const DemoModel = (props: Props) => {
  const { demoModel } = props.form;

  if (isObjDemoModel(demoModel)) return <ObjLoadedDemoModel {...props} model={demoModel} />;
  if (isStlDemoModel(demoModel)) return <StlLoadedDemoModel {...props} model={demoModel} />;
  return <DemoModelInner {...props} />;
};

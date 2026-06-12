import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';

import { FormObject } from '../form/schema';
import { SIDEBAR_PERCENT } from '../constants';

import { CameraController, CameraTarget } from './CameraController';
import { CameraFocusButtons } from './CameraFocusButtons';
import { PatternModel } from './PatternModel';
import { useWindowSize } from './useWindowSize';

import './render.css';

interface Props {
  style: React.CSSProperties | undefined;
  form: FormObject;
}

export const SceneRender = ({ style, form }: Props) => {
  const [width, height] = useWindowSize();
  const sectionRatio = (100 - SIDEBAR_PERCENT) / 100;
  const [cameraTarget, setCameraTarget] = useState<CameraTarget>(() => [0, 0, form.height / 2]);

  return (
    <section className="render" style={style}>
      <CameraFocusButtons
        demoEnabled={form.demoEnabled}
        height={form.height}
        demoSize={form.demoSize}
        onFocus={setCameraTarget}
      />
      <Canvas
        style={{ width: width * sectionRatio, height }}
        camera={{ position: [400, -400, 400], up: [0, 0, 1], fov: 50, near: 1, far: 10000 }}
        gl={{ alpha: true }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[300, -500, 600]} intensity={0.8} />
        <directionalLight position={[-400, 300, -200]} intensity={0.25} />
        <Suspense fallback={null}>
          <PatternModel form={form} />
        </Suspense>
        <CameraController target={cameraTarget} />
      </Canvas>
    </section>
  );
};

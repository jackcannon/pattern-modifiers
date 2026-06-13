import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';

import { FormObject } from '../form/schema';
import { getBuildPlateDimensions } from '../form/buildVolumePresets';
import { SIDEBAR_PERCENT } from '../constants';

import { CameraAngleResetButton } from './CameraAngleResetButton';
import { CameraController, CameraTarget } from './CameraController';
import { CameraFocusButtons } from './CameraFocusButtons';
import { defaultCameraTarget, DEFAULT_CAMERA_FOV, DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_UP } from './cameraDefaults';
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
  const plate = getBuildPlateDimensions(form.buildVolumePreset);
  const viewHeight = Math.max(form.height, plate.height);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget>(() => defaultCameraTarget(viewHeight));
  const [cameraAngleReset, setCameraAngleReset] = useState(0);

  return (
    <section className="render" style={style}>
      <CameraFocusButtons
        demoEnabled={form.demoEnabled}
        height={viewHeight}
        demoSize={form.demoSize}
        onFocus={setCameraTarget}
      />
      <CameraAngleResetButton onReset={() => setCameraAngleReset((n) => n + 1)} />
      <Canvas
        style={{ width: width * sectionRatio, height }}
        camera={{
          position: DEFAULT_CAMERA_POSITION,
          up: DEFAULT_CAMERA_UP,
          fov: DEFAULT_CAMERA_FOV,
          near: 1,
          far: 10000
        }}
        gl={{ alpha: true }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[300, -500, 600]} intensity={0.8} />
        <directionalLight position={[-400, 300, -200]} intensity={0.25} />
        <Suspense fallback={null}>
          <PatternModel form={form} />
        </Suspense>
        <CameraController target={cameraTarget} resetAngleSignal={cameraAngleReset} />
      </Canvas>
    </section>
  );
};

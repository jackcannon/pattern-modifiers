import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { PerspectiveCamera } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import { DEFAULT_CAMERA_FOV, DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_UP } from './cameraDefaults';

export type CameraTarget = [number, number, number];

interface Props {
  target: CameraTarget;
  resetAngleSignal: number;
}

export const CameraController = ({ target, resetAngleSignal }: Props) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.target.set(target[0], target[1], target[2]);
    controls.update();
  }, [target]);

  useEffect(() => {
    if (resetAngleSignal === 0) return;

    const controls = controlsRef.current;
    const camera = controls?.object;
    if (!controls || !(camera instanceof PerspectiveCamera)) return;

    camera.position.set(...DEFAULT_CAMERA_POSITION);
    camera.up.set(...DEFAULT_CAMERA_UP);
    camera.fov = DEFAULT_CAMERA_FOV;
    camera.updateProjectionMatrix();
    controls.update();
  }, [resetAngleSignal]);

  return <OrbitControls ref={controlsRef} makeDefault target={target} />;
};

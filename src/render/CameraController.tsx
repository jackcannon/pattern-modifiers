import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export type CameraTarget = [number, number, number];

interface Props {
  target: CameraTarget;
}

export const CameraController = ({ target }: Props) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.target.set(target[0], target[1], target[2]);
    controls.update();
  }, [target]);

  return <OrbitControls ref={controlsRef} makeDefault target={target} />;
};

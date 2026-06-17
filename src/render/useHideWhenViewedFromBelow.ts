import { useFrame, useThree } from '@react-three/fiber';
import { RefObject } from 'react';
import { Material } from 'three';

/**
 * Fades a material out when the camera sits below the build plate (Z = 0).
 *
 * @param {RefObject<Material | null>} materialRef - material to update
 * @param {number} visibleOpacity - opacity when the camera is above the plate
 */
export const useHideWhenViewedFromBelow = (
  materialRef: RefObject<Material | null>,
  visibleOpacity: number
) => {
  const { camera } = useThree();

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;

    const opacity = camera.position.z < 0 ? 0 : visibleOpacity;
    if (material.opacity !== opacity) material.opacity = opacity;
  });
};

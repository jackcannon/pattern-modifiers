import { BufferAttribute, BufferGeometry } from 'three';

import { FormObject } from '../form/schema';

import { buildPatternGrid } from './patternField';
import { marchingCubes } from './marchingCubes';

export { createPatternField } from './patternField';
export type { PatternField } from './patternField';

/**
 * Generates the pattern modifier geometry from the current form settings.
 *
 * Coordinates are printer-space (mm, Z-up): X/Y centred on the origin,
 * Z runs from -overflow (below the build plate) to height + overflow.
 *
 * @param {FormObject} form - current form settings
 * @param {number} resolution - grid cells along the longest axis
 * @returns {BufferGeometry} triangle soup geometry with computed normals
 */
export const generateGeometry = (form: FormObject, resolution: number): BufferGeometry => {
  const { field, grid, iso } = buildPatternGrid(form, resolution);
  const positions = marchingCubes(field, grid, iso);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();

  return geometry;
};

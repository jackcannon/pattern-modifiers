import { BufferAttribute, BufferGeometry } from 'three';

import { FormObject } from '../form/schema';

import { buildPatternGrid, prepareMarchingCubesField } from './patternField';
import { marchingCubes } from './marchingCubes';
import { getPatternDefinition } from './patterns/registry';

export { createPatternField } from './patternField';
export type { PatternField } from './patternField';

/**
 * Generates the pattern modifier geometry from the current form settings.
 *
 * Coordinates are printer-space (mm, Z-up): X/Y centred on the origin,
 * Z runs from 0 (build plate) to height.
 *
 * @param {FormObject} form - current form settings
 * @param {number} resolution - grid cells along the longest axis
 * @returns {BufferGeometry} triangle soup geometry (positions only)
 */
export const generateGeometry = (form: FormObject, resolution: number): BufferGeometry => {
  const pattern = getPatternDefinition(form.type);

  let positions: Float32Array;
  if (pattern.buildGeometry) {
    positions = pattern.buildGeometry(form, resolution);
  } else {
    const { field, grid, iso } = buildPatternGrid(form, resolution);
    const solidHigh = pattern.fixedIso !== undefined ? false : form.thresholdInverse;
    const mcField = prepareMarchingCubesField(field, iso, solidHigh);
    positions = marchingCubes(mcField, grid, iso, true);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  // No vertex normals: the preview material is flat-shaded (normals from screen-space derivatives) and the STL
  // exporter computes its own per-face normals, so computing them here would be wasted work and memory.

  return geometry;
};

import { BufferAttribute, BufferGeometry } from 'three';

import { FormObject } from '../form/schema';

import { GridSpec, marchingCubes } from './marchingCubes';
import { PerlinNoise3D } from './perlin';

// Value far below any threshold; pushes interpolated boundary vertices onto the box faces
const OUTSIDE = -1e9;

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
  const { width, height, depth, overflow, seed, scale, threshold, octaves, persistence } = form;

  // outer dimensions including overflow on every side
  const outerW = width + overflow * 2;
  const outerD = depth + overflow * 2;
  const outerH = height + overflow * 2;

  // cell counts proportional to dimensions; longest axis gets `resolution` cells
  const longest = Math.max(outerW, outerD, outerH);
  const cellsX = Math.max(2, Math.round((outerW / longest) * resolution));
  const cellsY = Math.max(2, Math.round((outerD / longest) * resolution));
  const cellsZ = Math.max(2, Math.round((outerH / longest) * resolution));

  const sx = outerW / cellsX;
  const sy = outerD / cellsY;
  const sz = outerH / cellsZ;

  // samples span the volume exactly, plus one forced-outside padding layer on
  // each side so the mesh is watertight and clipped flush at the box faces
  const grid: GridSpec = {
    nx: cellsX + 3,
    ny: cellsY + 3,
    nz: cellsZ + 3,
    x0: -outerW / 2 - sx,
    y0: -outerD / 2 - sy,
    z0: -overflow - sz,
    sx,
    sy,
    sz
  };

  const noise = new PerlinNoise3D(seed);
  const field = new Float32Array(grid.nx * grid.ny * grid.nz);

  // histogram of noise values, used to map the threshold percentage onto the
  // actual value distribution (fBm clusters around 0.5, so a linear mapping
  // would leave most of the percentage range doing nothing)
  const BINS = 1024;
  const histogram = new Uint32Array(BINS);
  let sampleCount = 0;

  let idx = 0;
  for (let k = 0; k < grid.nz; k++) {
    const isPadZ = k === 0 || k === grid.nz - 1;
    const z = grid.z0 + k * sz;
    for (let j = 0; j < grid.ny; j++) {
      const isPadY = j === 0 || j === grid.ny - 1;
      const y = grid.y0 + j * sy;
      for (let i = 0; i < grid.nx; i++) {
        const isPadX = i === 0 || i === grid.nx - 1;

        if (isPadX || isPadY || isPadZ) {
          field[idx++] = OUTSIDE;
          continue;
        }

        const x = grid.x0 + i * sx;
        const value = noise.fbm(x / scale, y / scale, z / scale, octaves, persistence);
        field[idx++] = value;

        histogram[Math.min(BINS - 1, Math.max(0, Math.floor(value * BINS)))]++;
        sampleCount++;
      }
    }
  }

  // iso level at the (100 - threshold)th percentile, so threshold% of the volume is solid
  const targetSolid = (sampleCount * threshold) / 100;
  let above = 0;
  let isoBin = BINS - 1;
  while (isoBin > 0 && above < targetSolid) {
    above += histogram[isoBin];
    isoBin--;
  }
  const iso = (isoBin + 1) / BINS;

  const positions = marchingCubes(field, grid, iso);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();

  return geometry;
};

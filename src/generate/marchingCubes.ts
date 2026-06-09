import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js';

// Tables are flat Int32Arrays at runtime (the .d.ts types them incorrectly)
const EDGE_TABLE = edgeTable as unknown as Int32Array;
const TRI_TABLE = triTable as unknown as Int32Array;

// Bourke corner ordering: offsets (di, dj, dk) for corners 0-7
const CORNERS: [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1]
];

// Corner pairs for each of the 12 cube edges
const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7]
];

export interface GridSpec {
  /** Sample counts along each axis */
  nx: number;
  ny: number;
  nz: number;
  /** World position of sample (0, 0, 0) */
  x0: number;
  y0: number;
  z0: number;
  /** World distance between samples along each axis */
  sx: number;
  sy: number;
  sz: number;
}

/**
 * Extracts an isosurface from a scalar field using the marching cubes algorithm.
 * Field is indexed as i + j * nx + k * nx * ny. Regions where field > iso are solid.
 *
 * @param {Float32Array} field - scalar field samples
 * @param {GridSpec} grid - grid dimensions and world mapping
 * @param {number} iso - isosurface level
 * @returns {Float32Array} flat triangle soup positions (x, y, z per vertex)
 */
export const marchingCubes = (field: Float32Array, grid: GridSpec, iso: number): Float32Array => {
  const { nx, ny, nz, x0, y0, z0, sx, sy, sz } = grid;
  const nxy = nx * ny;

  const positions: number[] = [];

  // interpolated world-space vertex per cube edge
  const vertList = new Float32Array(12 * 3);
  const cornerVals = new Float32Array(8);

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const base = i + j * nx + k * nxy;

        cornerVals[0] = field[base];
        cornerVals[1] = field[base + 1];
        cornerVals[2] = field[base + 1 + nx];
        cornerVals[3] = field[base + nx];
        cornerVals[4] = field[base + nxy];
        cornerVals[5] = field[base + 1 + nxy];
        cornerVals[6] = field[base + 1 + nx + nxy];
        cornerVals[7] = field[base + nx + nxy];

        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          if (cornerVals[c] < iso) cubeIndex |= 1 << c;
        }

        const edgeBits = EDGE_TABLE[cubeIndex];
        if (edgeBits === 0) continue;

        for (let e = 0; e < 12; e++) {
          if (!(edgeBits & (1 << e))) continue;

          const [cA, cB] = EDGES[e];
          const valA = cornerVals[cA];
          const valB = cornerVals[cB];
          const [ax, ay, az] = CORNERS[cA];
          const [bx, by, bz] = CORNERS[cB];

          const denom = valB - valA;
          const mu = denom === 0 ? 0.5 : (iso - valA) / denom;

          vertList[e * 3 + 0] = x0 + (i + ax + (bx - ax) * mu) * sx;
          vertList[e * 3 + 1] = y0 + (j + ay + (by - ay) * mu) * sy;
          vertList[e * 3 + 2] = z0 + (k + az + (bz - az) * mu) * sz;
        }

        const triOffset = cubeIndex * 16;
        for (let t = 0; TRI_TABLE[triOffset + t] !== -1; t += 3) {
          const e1 = TRI_TABLE[triOffset + t];
          const e2 = TRI_TABLE[triOffset + t + 1];
          const e3 = TRI_TABLE[triOffset + t + 2];

          positions.push(
            vertList[e1 * 3],
            vertList[e1 * 3 + 1],
            vertList[e1 * 3 + 2],
            vertList[e2 * 3],
            vertList[e2 * 3 + 1],
            vertList[e2 * 3 + 2],
            vertList[e3 * 3],
            vertList[e3 * 3 + 1],
            vertList[e3 * 3 + 2]
          );
        }
      }
    }
  }

  return new Float32Array(positions);
};

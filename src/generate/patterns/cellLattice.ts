/**
 * Shared helpers for patterns built on a jittered cubic lattice of feature points.
 */

/**
 * Returns a row-major 3x3 rotation matrix from three Euler angles.
 * @param {number} a - rotation about X, in radians
 * @param {number} b - rotation about Y, in radians
 * @param {number} c - rotation about Z, in radians
 * @returns {number[]} nine matrix entries, row by row
 */
const rotation = (a: number, b: number, c: number): number[] => {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const cc = Math.cos(c);
  const sc = Math.sin(c);
  return [
    cb * cc,
    -cb * sc,
    sb,
    sa * sb * cc + ca * sc,
    -sa * sb * sc + ca * cc,
    -sa * cb,
    -ca * sb * cc + sa * sc,
    ca * sb * sc + sa * cc,
    ca * cb
  ];
};

// The lattice is tilted so no model face lines up with a lattice layer. Without this, a face that cuts
// through the middle of a layer looks different from a face between layers.
export const LATTICE_ROTATION = rotation(0.61, 0.93, 0.37);

/**
 * Hashes a lattice cell to a number in [0, 1).
 * @param {number} seed - hashed seed; add small offsets to get independent values for one cell
 * @param {number} x - cell X index
 * @param {number} y - cell Y index
 * @param {number} z - cell Z index
 * @returns {number} pseudo-random value in [0, 1)
 */
export const hash3 = (seed: number, x: number, y: number, z: number): number => {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  // Full murmur3 finaliser. One mixing round leaves curved bands in per-cell choices.
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const bccOffsets = new Float64Array(54 * 3);
const bccDistances = new Float64Array(54);

/**
 * Finds the distance from a point to the border of its cell in a jittered body-centred cubic lattice: one
 * feature point near each cell corner and one near each cell centre. Cells have 14 faces in 7
 * orientations, so a model face rarely meets a whole family of borders at a shallow angle.
 * @param {number} seedHash - hashed seed; uses `seedHash` to `seedHash + 5`
 * @param {number} jitter - feature point offset range, 0 to 1
 * @param {number} round - smooth-minimum radius that rounds cell corners; 0 keeps them sharp
 * @param {number} px - point X, in lattice units
 * @param {number} py - point Y, in lattice units
 * @param {number} pz - point Z, in lattice units
 * @returns {number} distance to the nearest bisector plane, in lattice units
 */
export const bccEdgeDistance = (
  seedHash: number,
  jitter: number,
  round: number,
  px: number,
  py: number,
  pz: number
): number => {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const iz = Math.floor(pz);
  const o = bccOffsets;
  let n = 0;
  let best = Infinity;
  let bi = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const cz = iz + dz;
        for (let k = 0; k < 2; k++, n += 3) {
          const s = seedHash + k * 3;
          const base = k * 0.5;
          const ox = cx + base + jitter * (hash3(s, cx, cy, cz) - 0.5) - px;
          const oy = cy + base + jitter * (hash3(s + 1, cx, cy, cz) - 0.5) - py;
          const oz = cz + base + jitter * (hash3(s + 2, cx, cy, cz) - 0.5) - pz;
          o[n] = ox;
          o[n + 1] = oy;
          o[n + 2] = oz;
          const d = ox * ox + oy * oy + oz * oz;
          if (d < best) {
            best = d;
            bi = n;
          }
        }
      }
    }
  }

  const bx = o[bi];
  const by = o[bi + 1];
  const bz = o[bi + 2];
  const dist = bccDistances;
  let edge = Infinity;
  for (let j = 0; j < n; j += 3) {
    const ox = o[j];
    const oy = o[j + 1];
    const oz = o[j + 2];
    const ex = ox - bx;
    const ey = oy - by;
    const ez = oz - bz;
    const len = Math.hypot(ex, ey, ez);
    const d = j === bi || len < 1e-9 ? Infinity : (0.5 * ((ox + bx) * ex + (oy + by) * ey + (oz + bz) * ez)) / len;
    dist[j / 3] = d;
    if (d < edge) edge = d;
  }
  if (round <= 0) return edge;
  // Log-sum-exp smooth minimum. Unlike a pairwise smooth minimum it does not depend on the order of the
  // neighbours, and far neighbours add almost nothing, so the result does not jump when the search block
  // moves to the next cell.
  let sum = 0;
  for (let j = 0; j < n / 3; j++) sum += Math.exp((edge - dist[j]) / round);
  return edge - round * Math.log(sum);
};


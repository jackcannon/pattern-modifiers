import { SimplexNoise3D } from '../simplex';
import { CORNERS, EDGE_TABLE, EDGES, GridSpec, TRI_TABLE } from '../marchingCubes';
import type { FormObject } from '../../form/schema';

import { NOISE_FIELD_KEYS, TOPOGRAPHICAL_FIELD_KEYS } from './fieldKeys';
import type { ClipFieldSpec, PatternDefinition, PatternSampleContext } from './types';

// Flattened marching-cubes corner/edge tables for fast indexing in the hot loop.
const CORNER_X = new Int8Array(CORNERS.map((c) => c[0]));
const CORNER_Y = new Int8Array(CORNERS.map((c) => c[1]));
const CORNER_Z = new Int8Array(CORNERS.map((c) => c[2]));
const EDGE_A = new Int8Array(EDGES.map((e) => e[0]));
const EDGE_B = new Int8Array(EDGES.map((e) => e[1]));

/** Resolution of the value -> nearest-line-distance lookup table */
const LUT_BINS = 2048;

/** Stratified samples per axis used to estimate the noise value distribution (percentile levels) */
const DIST_SAMPLES_PER_AXIS = 28;

/** Quantise world coords for edge identity (mm × 1e4) */
const EDGE_Q = 10000;

const vtxKey = (x: number, y: number, z: number): string => {
  return `${Math.round(x * EDGE_Q)},${Math.round(y * EDGE_Q)},${Math.round(z * EDGE_Q)}`;
};

const undirectedEdgeKeyFromVtx = (a: string, b: string): string => {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};

const centerSideKey = (li: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): string => {
  let ax = Math.round(x1 * EDGE_Q);
  let ay = Math.round(y1 * EDGE_Q);
  let az = Math.round(z1 * EDGE_Q);
  let bx = Math.round(x2 * EDGE_Q);
  let by = Math.round(y2 * EDGE_Q);
  let bz = Math.round(z2 * EDGE_Q);
  if (ax > bx || (ax === bx && ay > by) || (ax === bx && ay === by && az > bz)) {
    const tx = ax; ax = bx; bx = tx;
    const ty = ay; ay = by; by = ty;
    const tz = az; az = bz; bz = tz;
  }
  return `${li}|${ax},${ay},${az}|${bx},${by},${bz}`;
};

/** Floor on the gradient magnitude so flat areas / extrema don't produce runaway distances */
const MIN_GRADIENT = 1e-4;

/** MC patch edge id: (min(ea,eb) << 4) | max(ea,eb), ea/eb in 0..11 */
const PATCH_EDGE_ID = new Uint8Array(144);
for (let a = 0; a < 12; a++) {
  for (let b = 0; b < 12; b++) {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    PATCH_EDGE_ID[a * 12 + b] = (lo << 4) | hi;
  }
}

interface TopographicalContext extends PatternSampleContext {
  noise: SimplexNoise3D;
  invScale: number;
  octaves: number;
  persistence: number;
  halfThickness: number;
  /** Noise values of each topographical level, ascending */
  levels: Float32Array;
  lutMin: number;
  lutInvStep: number;
  lutMaxIndex: number;
  nearestDist: Float32Array;
}

/**
 * Builds the noise value distribution, derives evenly-spaced topographical levels in noise value space, and
 * precomputes a lookup table of the distance (in noise-value units) from any value to its nearest level.
 *
 * @param {FormObject} form - current form settings
 * @returns {TopographicalContext} sampling context for the topographical pattern
 */
const createTopographicalContext = (form: FormObject): TopographicalContext => {
  const noise = new SimplexNoise3D(form.seed);
  const scale = form.scale;
  const invScale = 1 / scale;
  const octaves = form.octaves;
  const persistence = form.persistence;

  const minX = -form.width / 2;
  const minY = -form.depth / 2;
  const spanX = form.width;
  const spanY = form.depth;
  const spanZ = form.height;

  const n = DIST_SAMPLES_PER_AXIS;
  let vmin = Infinity;
  let vmax = -Infinity;
  if (octaves === 1) {
    for (let i = 0; i < n; i++) {
      const x = (minX + (spanX * (i + 0.5)) / n) * invScale;
      for (let j = 0; j < n; j++) {
        const y = (minY + (spanY * (j + 0.5)) / n) * invScale;
        for (let k = 0; k < n; k++) {
          const z = ((spanZ * (k + 0.5)) / n) * invScale;
          const v = noise.fbm1(x, y, z);
          if (v < vmin) vmin = v;
          if (v > vmax) vmax = v;
        }
      }
    }
  } else if (octaves === 2) {
    for (let i = 0; i < n; i++) {
      const x = (minX + (spanX * (i + 0.5)) / n) * invScale;
      for (let j = 0; j < n; j++) {
        const y = (minY + (spanY * (j + 0.5)) / n) * invScale;
        for (let k = 0; k < n; k++) {
          const z = ((spanZ * (k + 0.5)) / n) * invScale;
          const v = noise.fbm2(x, y, z, persistence);
          if (v < vmin) vmin = v;
          if (v > vmax) vmax = v;
        }
      }
    }
  } else if (octaves === 4) {
    for (let i = 0; i < n; i++) {
      const x = (minX + (spanX * (i + 0.5)) / n) * invScale;
      for (let j = 0; j < n; j++) {
        const y = (minY + (spanY * (j + 0.5)) / n) * invScale;
        for (let k = 0; k < n; k++) {
          const z = ((spanZ * (k + 0.5)) / n) * invScale;
          const v = noise.fbm4(x, y, z, persistence);
          if (v < vmin) vmin = v;
          if (v > vmax) vmax = v;
        }
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const x = (minX + (spanX * (i + 0.5)) / n) * invScale;
      for (let j = 0; j < n; j++) {
        const y = (minY + (spanY * (j + 0.5)) / n) * invScale;
        for (let k = 0; k < n; k++) {
          const z = ((spanZ * (k + 0.5)) / n) * invScale;
          const v = noise.fbm(x, y, z, octaves, persistence);
          if (v < vmin) vmin = v;
          if (v > vmax) vmax = v;
        }
      }
    }
  }
  const range = vmax - vmin || 1;

  // Evenly spaced levels in noise *value* space (like real topographic elevation intervals).
  // Percentile spacing bunches lines on common slopes and leaves large empty regions inside closed loops
  // at peaks and valleys where values are rare but occupy a lot of surface area.
  const spacingFrac = form.lineSpacing / 100;
  const valueStep = spacingFrac * range;
  let levelsCount = 0;
  if (valueStep > 0) {
    for (let v = vmin + valueStep; v < vmax; v += valueStep) levelsCount++;
  }
  const levels = new Float32Array(levelsCount);
  for (let i = 0; i < levelsCount; i++) {
    levels[i] = vmin + valueStep * (i + 1);
  }

  const step = range / (LUT_BINS - 1);
  const nearestDist = new Float32Array(LUT_BINS);
  if (levels.length === 0) {
    nearestDist.fill(range);
  } else {
    const last = levels.length - 1;
    let li = 0;
    for (let b = 0; b < LUT_BINS; b++) {
      const v = vmin + b * step;
      while (li < last && levels[li + 1] <= v) li++;
      let best = Math.abs(v - levels[li]);
      if (li + 1 < levels.length) {
        const next = Math.abs(v - levels[li + 1]);
        if (next < best) best = next;
      }
      nearestDist[b] = best;
    }
  }

  return {
    noise,
    invScale,
    octaves,
    persistence,
    halfThickness: form.lineThickness / 2,
    levels,
    lutMin: vmin,
    lutInvStep: 1 / step,
    lutMaxIndex: LUT_BINS - 1,
    nearestDist
  };
};

/**
 * First-order distance (mm) from a point to the nearest topographical surface: |noise - level| / |∇noise|.
 * Dividing by the analytic gradient gives a uniform-width band regardless of terrain steepness.
 *
 * @param {TopographicalContext} c - topographical context
 * @param {number} x - sample X (mm)
 * @param {number} y - sample Y (mm)
 * @param {number} z - sample Z (mm)
 * @returns {number} distance to nearest topographical line in millimetres
 */
const topographicalDistance = (c: TopographicalContext, x: number, y: number, z: number): number => {
  const { noise, invScale, octaves, persistence } = c;
  const sx = x * invScale;
  const sy = y * invScale;
  const sz = z * invScale;
  let n0: number;
  if (octaves === 1) {
    n0 = noise.fbmGrad1(sx, sy, sz);
  } else if (octaves === 2) {
    n0 = noise.fbmGrad2(sx, sy, sz, persistence);
  } else if (octaves === 4) {
    n0 = noise.fbmGrad4(sx, sy, sz, persistence);
  } else {
    n0 = noise.fbmGrad(sx, sy, sz, octaves, persistence);
  }

  const gx = noise.gradX * invScale;
  const gy = noise.gradY * invScale;
  const gz = noise.gradZ * invScale;
  let gradMag = Math.sqrt(gx * gx + gy * gy + gz * gz);
  if (gradMag < MIN_GRADIENT) gradMag = MIN_GRADIENT;

  let b = Math.round((n0 - c.lutMin) * c.lutInvStep);
  if (b < 0) b = 0;
  else if (b > c.lutMaxIndex) b = c.lutMaxIndex;

  return c.nearestDist[b] / gradMag;
};

/** Number of floats per chunk (~5.6M triangles' worth). Chunks grow the buffer without recopying old data */
const CHUNK_FLOATS = 1 << 24;

/**
 * Triangle-soup position buffer (flat x,y,z) that grows by appending fresh chunks instead of reallocating and
 * copying, so the total data is copied exactly once (at {@link toArray}) regardless of final size.
 */
class PositionBuffer {
  private chunks: Float32Array[] = [];
  private current = new Float32Array(CHUNK_FLOATS);
  private offset = 0;
  private total = 0;

  private ensureSpace(n: number) {
    if (this.offset + n <= this.current.length) return;
    this.chunks.push(this.current.subarray(0, this.offset));
    this.current = new Float32Array(CHUNK_FLOATS);
    this.offset = 0;
  }

  /** Outer tri then reversed inner tri */
  pushThickTri(
    ov1x: number, ov1y: number, ov1z: number,
    ov2x: number, ov2y: number, ov2z: number,
    ov3x: number, ov3y: number, ov3z: number,
    iv1x: number, iv1y: number, iv1z: number,
    iv2x: number, iv2y: number, iv2z: number,
    iv3x: number, iv3y: number, iv3z: number
  ) {
    this.ensureSpace(18);
    const d = this.current;
    let o = this.offset;
    d[o] = ov1x; d[o + 1] = ov1y; d[o + 2] = ov1z;
    d[o + 3] = ov2x; d[o + 4] = ov2y; d[o + 5] = ov2z;
    d[o + 6] = ov3x; d[o + 7] = ov3y; d[o + 8] = ov3z;
    d[o + 9] = iv1x; d[o + 10] = iv1y; d[o + 11] = iv1z;
    d[o + 12] = iv3x; d[o + 13] = iv3y; d[o + 14] = iv3z;
    d[o + 15] = iv2x; d[o + 16] = iv2y; d[o + 17] = iv2z;
    this.offset = o + 18;
    this.total += 18;
  }

  /** Side quad between outer segment (ov1–ov2) and inner segment (iv1–iv2); reversed outer winding */
  pushSideQuad(
    ov1x: number, ov1y: number, ov1z: number,
    ov2x: number, ov2y: number, ov2z: number,
    iv1x: number, iv1y: number, iv1z: number,
    iv2x: number, iv2y: number, iv2z: number
  ) {
    this.ensureSpace(18);
    const d = this.current;
    let o = this.offset;
    d[o] = ov2x; d[o + 1] = ov2y; d[o + 2] = ov2z;
    d[o + 3] = ov1x; d[o + 4] = ov1y; d[o + 5] = ov1z;
    d[o + 6] = iv1x; d[o + 7] = iv1y; d[o + 8] = iv1z;
    d[o + 9] = ov2x; d[o + 10] = ov2y; d[o + 11] = ov2z;
    d[o + 12] = iv1x; d[o + 13] = iv1y; d[o + 14] = iv1z;
    d[o + 15] = iv2x; d[o + 16] = iv2y; d[o + 17] = iv2z;
    this.offset = o + 18;
    this.total += 18;
  }

  toArray(): Float32Array {
    if (this.chunks.length === 0) {
      return this.current.slice(0, this.offset);
    }
    const result = new Float32Array(this.total);
    let at = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, at);
      at += chunk.length;
    }
    result.set(this.current.subarray(0, this.offset), at);
    return result;
  }
}

/**
 * Extracts every topographical isosurface in a single grid pass and thickens each into a uniform shell. Corner values
 * are read once per cube and only the topographical levels the cube actually brackets are processed; each edge vertex's
 * analytic normal is computed once per cube (shared across that cube's triangles). Output is identical to running
 * {@link marchingCubes} per level and offsetting every triangle vertex, but far cheaper.
 *
 * @param {Float32Array} field - raw noise values on the grid
 * @param {GridSpec} grid - grid dimensions and world mapping
 * @param {number[]} levels - topographical noise levels, ascending
 * @param {SimplexNoise3D} noise - seeded noise (for analytic normals)
 * @param {number} invScale - 1 / feature size
 * @param {number} octaves - fbm octave count
 * @param {number} persistence - fbm amplitude falloff
 * @param {number} halfThickness - half the line thickness in mm
 * @param bounds - model box; offset vertices are clamped to these limits
 * @param {PositionBuffer} out - destination triangle buffer
 * @returns {void}
 */
const marchAndThickenAllLevels = (
  field: Float32Array,
  grid: GridSpec,
  levels: Float32Array,
  noise: SimplexNoise3D,
  invScale: number,
  octaves: number,
  persistence: number,
  halfThickness: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
  out: PositionBuffer
) => {
  const { nx, ny, nz, x0, y0, z0, sx, sy, sz } = grid;
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  const nxy = nx * ny;
  const nLevels = levels.length;
  if (nLevels === 0) return;
  const levelMin = levels[0];
  const levelMax = levels[nLevels - 1];
  const fld = field;
  const halfThick = halfThickness;

  const cornerOffset = new Int32Array([0, 1, 1 + nx, nx, nxy, 1 + nxy, 1 + nx + nxy, nx + nxy]);
  const co = cornerOffset;

  const ovx = new Float32Array(12);
  const ovy = new Float32Array(12);
  const ovz = new Float32Array(12);
  const ivx = new Float32Array(12);
  const ivy = new Float32Array(12);
  const ivz = new Float32Array(12);
  const cvx = new Float32Array(12);
  const cvy = new Float32Array(12);
  const cvz = new Float32Array(12);
  const ovKeys: string[] = new Array(12);

  const patchGenStamp = new Uint32Array(256);
  const patchEdgeCount = new Uint8Array(256);
  const stamp = patchGenStamp;
  const pCount = patchEdgeCount;
  let patchGen = 0;
  const patchTris = new Int8Array(16);
  const patchId12 = new Uint8Array(5);
  const patchId23 = new Uint8Array(5);
  const patchId31 = new Uint8Array(5);
  const triTable = TRI_TABLE;
  const edgeTable = EDGE_TABLE;
  const outerEdgeCount: Record<string, number> = Object.create(null);

  const pendingOuterKeys: string[] = new Array(1 << 17);
  const pendingLevelIdx: number[] = new Array(1 << 17);
  let pendingCvBuf = new Float32Array(1 << 17);
  let pendingCvLen = 0;
  let pendingCoordCap = 1 << 18;
  let pendingCoords = new Float32Array(1 << 18);
  let pendingLen = 0;

  const queueBoundarySide = (outerKey: string, li: number, e1: number, e2: number) => {
    const pi = pendingLen++;
    if (pi + 1 >= pendingOuterKeys.length) {
      const cap = pendingOuterKeys.length << 1;
      pendingOuterKeys.length = cap;
      pendingLevelIdx.length = cap;
    }
    pendingOuterKeys[pi] = outerKey;
    pendingLevelIdx[pi] = li;
    if (pendingCvLen + 6 > pendingCvBuf.length) {
      const next = new Float32Array(pendingCvBuf.length << 1);
      next.set(pendingCvBuf.subarray(0, pendingCvLen));
      pendingCvBuf = next;
    }
    let o = pendingCvLen;
    pendingCvBuf[o++] = cvx[e1]; pendingCvBuf[o++] = cvy[e1]; pendingCvBuf[o++] = cvz[e1];
    pendingCvBuf[o++] = cvx[e2]; pendingCvBuf[o++] = cvy[e2]; pendingCvBuf[o++] = cvz[e2];
    pendingCvLen = o;
    o = pi * 12;
    if (o + 12 > pendingCoordCap) {
      pendingCoordCap = Math.max(pendingCoordCap << 1, o + 12);
      const next = new Float32Array(pendingCoordCap);
      next.set(pendingCoords.subarray(0, pendingLen * 12));
      pendingCoords = next;
    }
    pendingCoords[o++] = ovx[e1]; pendingCoords[o++] = ovy[e1]; pendingCoords[o++] = ovz[e1];
    pendingCoords[o++] = ovx[e2]; pendingCoords[o++] = ovy[e2]; pendingCoords[o++] = ovz[e2];
    pendingCoords[o++] = ivx[e1]; pendingCoords[o++] = ivy[e1]; pendingCoords[o++] = ivz[e1];
    pendingCoords[o++] = ivx[e2]; pendingCoords[o++] = ivy[e2]; pendingCoords[o++] = ivz[e2];
  };

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const base = i + j * nx + k * nxy;

        const v0 = fld[base];
        const v1 = fld[base + 1];
        const v2 = fld[base + 1 + nx];
        const v3 = fld[base + nx];
        const v4 = fld[base + nxy];
        const v5 = fld[base + 1 + nxy];
        const v6 = fld[base + 1 + nx + nxy];
        const v7 = fld[base + nx + nxy];

        let mn = v0;
        let mx = v0;
        if (v1 < mn) mn = v1; else if (v1 > mx) mx = v1;
        if (v2 < mn) mn = v2; else if (v2 > mx) mx = v2;
        if (v3 < mn) mn = v3; else if (v3 > mx) mx = v3;
        if (v4 < mn) mn = v4; else if (v4 > mx) mx = v4;
        if (v5 < mn) mn = v5; else if (v5 > mx) mx = v5;
        if (v6 < mn) mn = v6; else if (v6 > mx) mx = v6;
        if (v7 < mn) mn = v7; else if (v7 > mx) mx = v7;

        if (mx < levelMin || mn > levelMax) continue;

        let lo = 0;
        let hi = nLevels;
        while (lo < hi) {
          const m = (lo + hi) >> 1;
          if (levels[m] < mn) lo = m + 1;
          else hi = m;
        }

        for (let li = lo; li < nLevels; li++) {
          const iso = levels[li];
          if (iso > mx) break;

          let cubeIndex = 0;
          if (v0 < iso) cubeIndex |= 1;
          if (v1 < iso) cubeIndex |= 2;
          if (v2 < iso) cubeIndex |= 4;
          if (v3 < iso) cubeIndex |= 8;
          if (v4 < iso) cubeIndex |= 16;
          if (v5 < iso) cubeIndex |= 32;
          if (v6 < iso) cubeIndex |= 64;
          if (v7 < iso) cubeIndex |= 128;

          const edgeBits = edgeTable[cubeIndex];
          if (edgeBits === 0) continue;

          for (let e = 0; e < 12; e++) {
            if ((edgeBits >> e & 1) === 0) continue;
            const cA = EDGE_A[e];
            const cB = EDGE_B[e];
            const valA = fld[base + co[cA]];
            const valB = fld[base + co[cB]];
            const denom = valB - valA;
            const mu = denom === 0 ? 0.5 : (iso - valA) / denom;

            const ax = CORNER_X[cA];
            const ay = CORNER_Y[cA];
            const az = CORNER_Z[cA];
            const dbx = CORNER_X[cB] - ax;
            const dby = CORNER_Y[cB] - ay;
            const dbz = CORNER_Z[cB] - az;
            const vx = x0 + (i + ax + dbx * mu) * sx;
            const vy = y0 + (j + ay + dby * mu) * sy;
            const vz = z0 + (k + az + dbz * mu) * sz;

            const nxn = vx * invScale;
            const nyn = vy * invScale;
            const nzn = vz * invScale;
            if (octaves === 1) {
              noise.fbmGrad1(nxn, nyn, nzn);
            } else if (octaves === 2) {
              noise.fbmGrad2(nxn, nyn, nzn, persistence);
            } else if (octaves === 4) {
              noise.fbmGrad4(nxn, nyn, nzn, persistence);
            } else {
              noise.fbmGrad(nxn, nyn, nzn, octaves, persistence);
            }
            let gx = noise.gradX;
            let gy = noise.gradY;
            let gz = noise.gradZ;
            const len2 = gx * gx + gy * gy + gz * gz;
            const invLen = len2 > 0 ? halfThick / Math.sqrt(len2) : halfThick;
            gx *= invLen;
            gy *= invLen;
            gz *= invLen;
            cvx[e] = vx;
            cvy[e] = vy;
            cvz[e] = vz;
            const ovxRaw = vx + gx;
            const ovyRaw = vy + gy;
            const ovzRaw = vz + gz;
            const ivxRaw = vx - gx;
            const ivyRaw = vy - gy;
            const ivzRaw = vz - gz;
            ovx[e] = ovxRaw < minX ? minX : ovxRaw > maxX ? maxX : ovxRaw;
            ovy[e] = ovyRaw < minY ? minY : ovyRaw > maxY ? maxY : ovyRaw;
            ovz[e] = ovzRaw < minZ ? minZ : ovzRaw > maxZ ? maxZ : ovzRaw;
            ivx[e] = ivxRaw < minX ? minX : ivxRaw > maxX ? maxX : ivxRaw;
            ivy[e] = ivyRaw < minY ? minY : ivyRaw > maxY ? maxY : ivyRaw;
            ivz[e] = ivzRaw < minZ ? minZ : ivzRaw > maxZ ? maxZ : ivzRaw;
            ovKeys[e] = vtxKey(ovx[e], ovy[e], ovz[e]);
          }

          patchGen++;
          if (patchGen === 0) {
            patchGenStamp.fill(0);
            patchGen = 1;
          }
          const triOffset = cubeIndex * 16;
          let nPatchTris = 0;
          for (let t = 0; triTable[triOffset + t] !== -1; t += 3) {
            const e1 = triTable[triOffset + t];
            const e2 = triTable[triOffset + t + 1];
            const e3 = triTable[triOffset + t + 2];
            const ti = nPatchTris / 3;
            patchTris[nPatchTris++] = e1;
            patchTris[nPatchTris++] = e2;
            patchTris[nPatchTris++] = e3;
            const id12 = PATCH_EDGE_ID[e1 * 12 + e2];
            const id23 = PATCH_EDGE_ID[e2 * 12 + e3];
            const id31 = PATCH_EDGE_ID[e3 * 12 + e1];
            patchId12[ti] = id12;
            patchId23[ti] = id23;
            patchId31[ti] = id31;
            if (stamp[id12] !== patchGen) {
              stamp[id12] = patchGen;
              pCount[id12] = 1;
            } else pCount[id12]++;
            if (stamp[id23] !== patchGen) {
              stamp[id23] = patchGen;
              pCount[id23] = 1;
            } else pCount[id23]++;
            if (stamp[id31] !== patchGen) {
              stamp[id31] = patchGen;
              pCount[id31] = 1;
            } else pCount[id31]++;
          }

          for (let t = 0, ti = 0; t < nPatchTris; t += 3, ti++) {
            const e1 = patchTris[t];
            const e2 = patchTris[t + 1];
            const e3 = patchTris[t + 2];
            const id12 = patchId12[ti];
            const id23 = patchId23[ti];
            const id31 = patchId31[ti];

            out.pushThickTri(
              ovx[e1], ovy[e1], ovz[e1], ovx[e2], ovy[e2], ovz[e2], ovx[e3], ovy[e3], ovz[e3],
              ivx[e1], ivy[e1], ivz[e1], ivx[e2], ivy[e2], ivz[e2], ivx[e3], ivy[e3], ivz[e3]
            );

            const ok12 = undirectedEdgeKeyFromVtx(ovKeys[e1], ovKeys[e2]);
            const ok23 = undirectedEdgeKeyFromVtx(ovKeys[e2], ovKeys[e3]);
            const ok31 = undirectedEdgeKeyFromVtx(ovKeys[e3], ovKeys[e1]);
            let ec = outerEdgeCount[ok12];
            outerEdgeCount[ok12] = ec === undefined ? 1 : ec + 1;
            ec = outerEdgeCount[ok23];
            outerEdgeCount[ok23] = ec === undefined ? 1 : ec + 1;
            ec = outerEdgeCount[ok31];
            outerEdgeCount[ok31] = ec === undefined ? 1 : ec + 1;

            if (stamp[id12] === patchGen && pCount[id12] === 1) {
              queueBoundarySide(ok12, li, e1, e2);
            }
            if (stamp[id23] === patchGen && pCount[id23] === 1) {
              queueBoundarySide(ok23, li, e2, e3);
            }
            if (stamp[id31] === patchGen && pCount[id31] === 1) {
              queueBoundarySide(ok31, li, e3, e1);
            }
          }
        }
      }
    }
  }

  const sideEdgeSeen = new Set<string>();
  for (let pi = 0; pi < pendingLen; pi++) {
    const outerKey = pendingOuterKeys[pi];
    if (outerEdgeCount[outerKey] !== 1) continue;
    const cvi = pi * 6;
    const centerKey = centerSideKey(
      pendingLevelIdx[pi],
      pendingCvBuf[cvi], pendingCvBuf[cvi + 1], pendingCvBuf[cvi + 2],
      pendingCvBuf[cvi + 3], pendingCvBuf[cvi + 4], pendingCvBuf[cvi + 5]
    );
    if (sideEdgeSeen.has(centerKey)) continue;
    sideEdgeSeen.add(centerKey);
    const ci = pi * 12;
    out.pushSideQuad(
      pendingCoords[ci], pendingCoords[ci + 1], pendingCoords[ci + 2],
      pendingCoords[ci + 3], pendingCoords[ci + 4], pendingCoords[ci + 5],
      pendingCoords[ci + 6], pendingCoords[ci + 7], pendingCoords[ci + 8],
      pendingCoords[ci + 9], pendingCoords[ci + 10], pendingCoords[ci + 11]
    );
  }
};

/**
 * Builds the topographical modifier geometry. For each topographical level it extracts the noise isosurface with marching
 * cubes (a clean, sub-voxel-accurate single surface), then thickens that surface into a uniform-thickness shell
 * by offsetting every vertex ±thickness/2 along the analytic surface normal. The separate shells are simply
 * concatenated. They are independent objects that don't share geometry.
 *
 * @param {FormObject} form - current form settings
 * @param {number} resolution - grid cells along the longest axis
 * @returns {Float32Array} flat triangle-soup positions
 */
export const buildTopographicalGeometry = (form: FormObject, resolution: number): Float32Array => {
  const ctx = createTopographicalContext(form);
  const { noise, invScale, octaves, persistence, levels, halfThickness } = ctx;

  const W = form.width;
  const D = form.depth;
  const H = form.height;
  const longest = Math.max(W, D, H);
  const cellsX = Math.max(2, Math.round((W / longest) * resolution));
  const cellsY = Math.max(2, Math.round((D / longest) * resolution));
  const cellsZ = Math.max(2, Math.round((H / longest) * resolution));
  const nx = cellsX + 1;
  const ny = cellsY + 1;
  const nz = cellsZ + 1;
  const sx = W / cellsX;
  const sy = D / cellsY;
  const sz = H / cellsZ;
  const x0 = -W / 2;
  const y0 = -D / 2;
  const z0 = 0;

  const field = new Float32Array(nx * ny * nz);
  const xStep = sx * invScale;
  const yStep = sy * invScale;
  const zStep = sz * invScale;
  let idx = 0;
  let z = z0 * invScale;
  if (octaves === 1) {
    for (let k = 0; k < nz; k++) {
      let y = y0 * invScale;
      for (let j = 0; j < ny; j++) {
        let x = x0 * invScale;
        for (let i = 0; i < nx; i++) {
          field[idx++] = noise.fbm1(x, y, z);
          x += xStep;
        }
        y += yStep;
      }
      z += zStep;
    }
  } else if (octaves === 2) {
    for (let k = 0; k < nz; k++) {
      let y = y0 * invScale;
      for (let j = 0; j < ny; j++) {
        let x = x0 * invScale;
        for (let i = 0; i < nx; i++) {
          field[idx++] = noise.fbm2(x, y, z, persistence);
          x += xStep;
        }
        y += yStep;
      }
      z += zStep;
    }
  } else if (octaves === 4) {
    for (let k = 0; k < nz; k++) {
      let y = y0 * invScale;
      for (let j = 0; j < ny; j++) {
        let x = x0 * invScale;
        for (let i = 0; i < nx; i++) {
          field[idx++] = noise.fbm4(x, y, z, persistence);
          x += xStep;
        }
        y += yStep;
      }
      z += zStep;
    }
  } else {
    for (let k = 0; k < nz; k++) {
      let y = y0 * invScale;
      for (let j = 0; j < ny; j++) {
        let x = x0 * invScale;
        for (let i = 0; i < nx; i++) {
          field[idx++] = noise.fbm(x, y, z, octaves, persistence);
          x += xStep;
        }
        y += yStep;
      }
      z += zStep;
    }
  }

  const grid: GridSpec = { nx, ny, nz, x0, y0, z0, sx, sy, sz };
  const out = new PositionBuffer();
  const bounds = { minX: x0, maxX: x0 + W, minY: y0, maxY: y0 + D, minZ: z0, maxZ: z0 + H };

  marchAndThickenAllLevels(
    field, grid, levels, noise, invScale, octaves, persistence, halfThickness, bounds, out
  );

  return out.toArray();
};

/**
 * Builds an exact, grid-free clip field for demo mode so thin lines are captured precisely instead of being
 * lost between voxel samples. Solid where the distance to the nearest topographical line is within half the thickness.
 *
 * @param {FormObject} form - current form settings
 * @param {number} resolution - demo grid cells along the longest axis (drives mesh subdivision)
 * @returns {ClipFieldSpec} analytic clip field
 */
export const createTopographicalClipField = (form: FormObject, resolution: number): ClipFieldSpec => {
  const ctx = createTopographicalContext(form);

  const W = form.width;
  const D = form.depth;
  const H = form.height;
  const longest = Math.max(W, D, H);
  const cell = longest / resolution;

  return {
    sample: (x, y, z) => topographicalDistance(ctx, x, y, z),
    iso: form.lineThickness / 2,
    solidHigh: false,
    bounds: { minX: -W / 2, maxX: W / 2, minY: -D / 2, maxY: D / 2, minZ: 0, maxZ: H },
    maxCellSize: Math.max(0.4, Math.min(cell, form.lineThickness))
  };
};

export const topographicalPattern: PatternDefinition = {
  type: 'topographical',
  label: 'Topographical',
  description: 'Map-like contour lines at fixed thickness, traced from noise height across the volume.',
  category: 'effects',
  formSections: [
    { title: 'Topographical', fields: [...TOPOGRAPHICAL_FIELD_KEYS] },
    { title: 'Noise', fields: [...NOISE_FIELD_KEYS] }
  ],
  fieldKeys: [...NOISE_FIELD_KEYS, ...TOPOGRAPHICAL_FIELD_KEYS],
  fieldDefaults: {
    scale: 60,
    octaves: 1,
    lineSpacing: 10,
    lineThickness: 1.5,
    demoResolution: 96
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.octaves, form.persistence, form.lineSpacing, form.lineThickness];
  },
  createContext(form) {
    return createTopographicalContext(form);
  },
  sample(_form, x, y, z, context) {
    const c = context as TopographicalContext;
    return topographicalDistance(c, x, y, z);
  },
  buildGeometry(form, resolution) {
    return buildTopographicalGeometry(form, resolution);
  },
  createClipField(form, resolution) {
    return createTopographicalClipField(form, resolution);
  }
};

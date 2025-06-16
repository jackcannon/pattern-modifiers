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

const undirectedEdgeKey = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): string => {
  const a = vtxKey(x1, y1, z1);
  const b = vtxKey(x2, y2, z2);
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
const patchEdgeId = (ea: number, eb: number): number => {
  const lo = ea < eb ? ea : eb;
  const hi = ea < eb ? eb : ea;
  return (lo << 4) | hi;
};

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
  const total = n * n * n;
  const samples = new Float64Array(total);
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const x = (minX + (spanX * (i + 0.5)) / n) * invScale;
    for (let j = 0; j < n; j++) {
      const y = (minY + (spanY * (j + 0.5)) / n) * invScale;
      for (let k = 0; k < n; k++) {
        const z = ((spanZ * (k + 0.5)) / n) * invScale;
        samples[idx++] = noise.fbm(x, y, z, octaves, persistence);
      }
    }
  }
  samples.sort();

  const vmin = samples[0];
  const vmax = samples[total - 1];
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
  const n0 = noise.fbmGrad(x * invScale, y * invScale, z * invScale, octaves, persistence);

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
    d[o++] = ov1x; d[o++] = ov1y; d[o++] = ov1z;
    d[o++] = ov2x; d[o++] = ov2y; d[o++] = ov2z;
    d[o++] = ov3x; d[o++] = ov3y; d[o++] = ov3z;
    d[o++] = iv1x; d[o++] = iv1y; d[o++] = iv1z;
    d[o++] = iv3x; d[o++] = iv3y; d[o++] = iv3z;
    d[o++] = iv2x; d[o++] = iv2y; d[o++] = iv2z;
    this.offset = o;
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
    d[o++] = ov2x; d[o++] = ov2y; d[o++] = ov2z;
    d[o++] = ov1x; d[o++] = ov1y; d[o++] = ov1z;
    d[o++] = iv1x; d[o++] = iv1y; d[o++] = iv1z;
    d[o++] = ov2x; d[o++] = ov2y; d[o++] = ov2z;
    d[o++] = iv1x; d[o++] = iv1y; d[o++] = iv1z;
    d[o++] = iv2x; d[o++] = iv2y; d[o++] = iv2z;
    this.offset = o;
    this.total += 18;
  }

  toArray(): Float32Array {
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

  const cornerOffset = new Int32Array([0, 1, 1 + nx, nx, nxy, 1 + nxy, 1 + nx + nxy, nx + nxy]);

  const ovx = new Float32Array(12);
  const ovy = new Float32Array(12);
  const ovz = new Float32Array(12);
  const ivx = new Float32Array(12);
  const ivy = new Float32Array(12);
  const ivz = new Float32Array(12);
  const cvx = new Float32Array(12);
  const cvy = new Float32Array(12);
  const cvz = new Float32Array(12);

  const patchGenStamp = new Uint32Array(256);
  const patchEdgeCount = new Uint8Array(256);
  let patchGen = 0;
  const patchTris = new Int8Array(16);
  const triTable = TRI_TABLE;
  const outerEdgeCount = new Map<string, number>();

  const pendingOuterKeys: string[] = [];
  const pendingLevelIdx: number[] = [];
  let pendingCvBuf = new Float32Array(1 << 16);
  let pendingCvLen = 0;
  let pendingCoordCap = 1 << 16;
  let pendingCoords = new Float32Array(pendingCoordCap);
  let pendingCoordLen = 0;

  const pushPendingCoords = (
    ov1x: number, ov1y: number, ov1z: number,
    ov2x: number, ov2y: number, ov2z: number,
    iv1x: number, iv1y: number, iv1z: number,
    iv2x: number, iv2y: number, iv2z: number
  ) => {
    if (pendingCoordLen + 12 > pendingCoordCap) {
      pendingCoordCap *= 2;
      const next = new Float32Array(pendingCoordCap);
      next.set(pendingCoords.subarray(0, pendingCoordLen));
      pendingCoords = next;
    }
    let o = pendingCoordLen;
    pendingCoords[o++] = ov1x; pendingCoords[o++] = ov1y; pendingCoords[o++] = ov1z;
    pendingCoords[o++] = ov2x; pendingCoords[o++] = ov2y; pendingCoords[o++] = ov2z;
    pendingCoords[o++] = iv1x; pendingCoords[o++] = iv1y; pendingCoords[o++] = iv1z;
    pendingCoords[o++] = iv2x; pendingCoords[o++] = iv2y; pendingCoords[o++] = iv2z;
    pendingCoordLen = o;
  };

  const queueBoundarySide = (
    outerKey: string,
    li: number,
    cx1: number, cy1: number, cz1: number,
    cx2: number, cy2: number, cz2: number,
    ov1x: number, ov1y: number, ov1z: number,
    ov2x: number, ov2y: number, ov2z: number,
    iv1x: number, iv1y: number, iv1z: number,
    iv2x: number, iv2y: number, iv2z: number
  ) => {
    pendingOuterKeys.push(outerKey);
    pendingLevelIdx.push(li);
    if (pendingCvLen + 6 > pendingCvBuf.length) {
      const next = new Float32Array(pendingCvBuf.length << 1);
      next.set(pendingCvBuf.subarray(0, pendingCvLen));
      pendingCvBuf = next;
    }
    let o = pendingCvLen;
    pendingCvBuf[o++] = cx1; pendingCvBuf[o++] = cy1; pendingCvBuf[o++] = cz1;
    pendingCvBuf[o++] = cx2; pendingCvBuf[o++] = cy2; pendingCvBuf[o++] = cz2;
    pendingCvLen = o;
    pushPendingCoords(ov1x, ov1y, ov1z, ov2x, ov2y, ov2z, iv1x, iv1y, iv1z, iv2x, iv2y, iv2z);
  };

  const bumpPatchEdge = (id: number) => {
    if (patchGenStamp[id] !== patchGen) {
      patchGenStamp[id] = patchGen;
      patchEdgeCount[id] = 1;
    } else {
      patchEdgeCount[id]++;
    }
  };

  const patchCount = (id: number) => (patchGenStamp[id] === patchGen ? patchEdgeCount[id] : 0);

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const base = i + j * nx + k * nxy;

        const v0 = field[base];
        const v1 = field[base + 1];
        const v2 = field[base + 1 + nx];
        const v3 = field[base + nx];
        const v4 = field[base + nxy];
        const v5 = field[base + 1 + nxy];
        const v6 = field[base + 1 + nx + nxy];
        const v7 = field[base + nx + nxy];

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

          const edgeBits = EDGE_TABLE[cubeIndex];
          if (edgeBits === 0) continue;

          for (let e = 0; e < 12; e++) {
            if (!(edgeBits & (1 << e))) continue;
            const cA = EDGE_A[e];
            const cB = EDGE_B[e];
            const valA = field[base + cornerOffset[cA]];
            const valB = field[base + cornerOffset[cB]];
            const denom = valB - valA;
            const mu = denom === 0 ? 0.5 : (iso - valA) / denom;

            const ax = CORNER_X[cA];
            const ay = CORNER_Y[cA];
            const az = CORNER_Z[cA];
            const vx = x0 + (i + ax + (CORNER_X[cB] - ax) * mu) * sx;
            const vy = y0 + (j + ay + (CORNER_Y[cB] - ay) * mu) * sy;
            const vz = z0 + (k + az + (CORNER_Z[cB] - az) * mu) * sz;

            noise.fbmGrad(vx * invScale, vy * invScale, vz * invScale, octaves, persistence);
            let gx = noise.gradX;
            let gy = noise.gradY;
            let gz = noise.gradZ;
            const len = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
            const scale = halfThickness / len;
            gx *= scale;
            gy *= scale;
            gz *= scale;
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
            patchTris[nPatchTris++] = e1;
            patchTris[nPatchTris++] = e2;
            patchTris[nPatchTris++] = e3;
            bumpPatchEdge(patchEdgeId(e1, e2));
            bumpPatchEdge(patchEdgeId(e2, e3));
            bumpPatchEdge(patchEdgeId(e3, e1));
          }

          for (let t = 0; t < nPatchTris; t += 3) {
            const e1 = patchTris[t];
            const e2 = patchTris[t + 1];
            const e3 = patchTris[t + 2];

            out.pushThickTri(
              ovx[e1], ovy[e1], ovz[e1], ovx[e2], ovy[e2], ovz[e2], ovx[e3], ovy[e3], ovz[e3],
              ivx[e1], ivy[e1], ivz[e1], ivx[e2], ivy[e2], ivz[e2], ivx[e3], ivy[e3], ivz[e3]
            );

            const ok12 = undirectedEdgeKey(ovx[e1], ovy[e1], ovz[e1], ovx[e2], ovy[e2], ovz[e2]);
            const ok23 = undirectedEdgeKey(ovx[e2], ovy[e2], ovz[e2], ovx[e3], ovy[e3], ovz[e3]);
            const ok31 = undirectedEdgeKey(ovx[e3], ovy[e3], ovz[e3], ovx[e1], ovy[e1], ovz[e1]);
            let n = outerEdgeCount.get(ok12);
            if (n === undefined) outerEdgeCount.set(ok12, 1);
            else outerEdgeCount.set(ok12, n + 1);
            n = outerEdgeCount.get(ok23);
            if (n === undefined) outerEdgeCount.set(ok23, 1);
            else outerEdgeCount.set(ok23, n + 1);
            n = outerEdgeCount.get(ok31);
            if (n === undefined) outerEdgeCount.set(ok31, 1);
            else outerEdgeCount.set(ok31, n + 1);

            const id12 = patchEdgeId(e1, e2);
            const id23 = patchEdgeId(e2, e3);
            const id31 = patchEdgeId(e3, e1);
            if (patchCount(id12) === 1) {
              queueBoundarySide(
                ok12, li,
                cvx[e1], cvy[e1], cvz[e1], cvx[e2], cvy[e2], cvz[e2],
                ovx[e1], ovy[e1], ovz[e1], ovx[e2], ovy[e2], ovz[e2],
                ivx[e1], ivy[e1], ivz[e1], ivx[e2], ivy[e2], ivz[e2]
              );
            }
            if (patchCount(id23) === 1) {
              queueBoundarySide(
                ok23, li,
                cvx[e2], cvy[e2], cvz[e2], cvx[e3], cvy[e3], cvz[e3],
                ovx[e2], ovy[e2], ovz[e2], ovx[e3], ovy[e3], ovz[e3],
                ivx[e2], ivy[e2], ivz[e2], ivx[e3], ivy[e3], ivz[e3]
              );
            }
            if (patchCount(id31) === 1) {
              queueBoundarySide(
                ok31, li,
                cvx[e3], cvy[e3], cvz[e3], cvx[e1], cvy[e1], cvz[e1],
                ovx[e3], ovy[e3], ovz[e3], ovx[e1], ovy[e1], ovz[e1],
                ivx[e3], ivy[e3], ivz[e3], ivx[e1], ivy[e1], ivz[e1]
              );
            }
          }
        }
      }
    }
  }

  const sideEdgeSeen = new Set<string>();
  const nPending = pendingOuterKeys.length;
  for (let pi = 0; pi < nPending; pi++) {
    if (outerEdgeCount.get(pendingOuterKeys[pi]) !== 1) continue;
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
  let idx = 0;
  for (let k = 0; k < nz; k++) {
    const z = (z0 + k * sz) * invScale;
    for (let j = 0; j < ny; j++) {
      const y = (y0 + j * sy) * invScale;
      let x = x0 * invScale;
      for (let i = 0; i < nx; i++) {
        field[idx++] = noise.fbm(x, y, z, octaves, persistence);
        x += xStep;
      }
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

import { BufferAttribute, BufferGeometry, Uint32BufferAttribute } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { ClipRuntime, PatternField } from '../generate/patternField';

export interface DemoClipResult {
  inside: BufferGeometry | null;
  outside: BufferGeometry | null;
}

export interface DemoClipReuse {
  inside: BufferGeometry | null;
  outside: BufferGeometry | null;
}

const EDGE_KEY_SCALE = 2_097_152;

/** Subdivision above this triangle count freezes or OOMs the browser tab. */
const MAX_PREPARED_DEMO_TRIANGLES = 220_000;
const MAX_SUBDIVISION_VERTICES = 350_000;
const MAX_SUBDIVISION_INDICES = MAX_PREPARED_DEMO_TRIANGLES * 3;

const edgeKey = (a: number, b: number) =>
  a < b ? a * EDGE_KEY_SCALE + b : b * EDGE_KEY_SCALE + a;

const decodeEdgeKey = (key: number) => ({
  a: Math.floor(key / EDGE_KEY_SCALE),
  b: key % EDGE_KEY_SCALE
});

const copyIndices = (indexAttr: BufferAttribute) => {
  const array = indexAttr.array as ArrayLike<number>;
  const indices = new Uint32Array(indexAttr.count);
  if (array instanceof Uint32Array) {
    indices.set(array);
    return indices;
  }
  if (array instanceof Uint16Array) {
    for (let i = 0; i < indexAttr.count; i++) indices[i] = array[i];
    return indices;
  }
  for (let i = 0; i < indexAttr.count; i++) indices[i] = indexAttr.getX(i);
  return indices;
};

const sampleAt = (clip: ClipRuntime, x: number, y: number, z: number) => {
  if (clip.analytic) return clip.analytic(x, y, z);

  const fx = (x - clip.x0) * clip.invSx;
  const fy = (y - clip.y0) * clip.invSy;
  const fz = (z - clip.z0) * clip.invSz;

  const i0 = fx < 0 ? 0 : fx > clip.maxI ? clip.maxI : fx | 0;
  const j0 = fy < 0 ? 0 : fy > clip.maxJ ? clip.maxJ : fy | 0;
  const k0 = fz < 0 ? 0 : fz > clip.maxK ? clip.maxK : fz | 0;

  const tx = fx - i0;
  const ty = fy - j0;
  const tz = fz - k0;

  const base = i0 + j0 * clip.strideY + k0 * clip.strideZ;
  const samples = clip.samples;
  const c000 = samples[base];
  const c100 = samples[base + 1];
  const c010 = samples[base + clip.strideY];
  const c110 = samples[base + 1 + clip.strideY];
  const c001 = samples[base + clip.strideZ];
  const c101 = samples[base + 1 + clip.strideZ];
  const c011 = samples[base + clip.strideY + clip.strideZ];
  const c111 = samples[base + 1 + clip.strideY + clip.strideZ];

  const c00 = c000 + (c100 - c000) * tx;
  const c10 = c010 + (c110 - c010) * tx;
  const c01 = c001 + (c101 - c001) * tx;
  const c11 = c011 + (c111 - c011) * tx;
  const c0 = c00 + (c10 - c00) * ty;
  const c1 = c01 + (c11 - c01) * ty;
  return c0 + (c1 - c0) * tz;
};

const isSolidAt = (clip: ClipRuntime, x: number, y: number, z: number) => {
  if (x < clip.minX || x > clip.maxX || y < clip.minY || y > clip.maxY || z < clip.minZ || z > clip.maxZ) {
    return false;
  }
  const value = sampleAt(clip, x, y, z);
  return clip.solidHigh ? value >= clip.iso : value <= clip.iso;
};

const isSolidValue = (value: number, clip: ClipRuntime) =>
  clip.solidHigh ? value >= clip.iso : value <= clip.iso;

const fieldValueAt = (clip: ClipRuntime, x: number, y: number, z: number) => {
  if (x < clip.minX || x > clip.maxX || y < clip.minY || y > clip.maxY || z < clip.minZ || z > clip.maxZ) {
    return clip.solidHigh ? clip.iso - 1 : clip.iso + 1;
  }
  return sampleAt(clip, x, y, z);
};

/** True when a thin wall shell may cross this edge even if both endpoints are outside. */
const edgeMayCrossSolid = (
  clip: ClipRuntime,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): boolean => {
  const fa = fieldValueAt(clip, ax, ay, az);
  const fb = fieldValueAt(clip, bx, by, bz);
  if (isSolidValue(fa, clip) || isSolidValue(fb, clip)) return true;
  if ((fa - clip.iso) * (fb - clip.iso) < 0) return true;

  const steps = clip.thinShell ? 12 : 1;
  let prevV = fa;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const v = fieldValueAt(clip, ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
    if (isSolidValue(v, clip)) return true;
    if ((prevV - clip.iso) * (v - clip.iso) < 0) return true;
    prevV = v;
  }

  return false;
};

const triangleMayIntersectThinSolid = (
  clip: ClipRuntime,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): boolean => {
  if (edgeMayCrossSolid(clip, ax, ay, az, bx, by, bz)) return true;
  if (edgeMayCrossSolid(clip, bx, by, bz, cx, cy, cz)) return true;
  if (edgeMayCrossSolid(clip, cx, cy, cz, ax, ay, az)) return true;
  const mx = (ax + bx + cx) / 3;
  const my = (ay + by + cy) / 3;
  const mz = (az + bz + cz) / 3;
  return isSolidAt(clip, mx, my, mz);
};

const THIN_SHELL_MAX_DEPTH = 4;
const THIN_SHELL_SUBDIVISION_DEPTH = 4;
const thinShellEdgePoint = new Float32Array(6);

const maxTriangleEdgeLength = (
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): number => {
  const ab = Math.hypot(bx - ax, by - ay, bz - az);
  const bc = Math.hypot(cx - bx, cy - by, cz - bz);
  const ca = Math.hypot(ax - cx, ay - cy, az - cz);
  return Math.max(ab, bc, ca);
};

const thinShellEdgeLimit = (clip: ClipRuntime): number =>
  Math.max(0.12, (clip.shellThickness ?? 1) * 0.35);

const thinShellMaxDepth = (clip: ClipRuntime): number =>
  clip.thinShell ? THIN_SHELL_SUBDIVISION_DEPTH : THIN_SHELL_MAX_DEPTH;

const writeIsoEdgePoint = (
  clip: ClipRuntime,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  out: Float32Array,
  offset: number
): boolean => {
  const fa = fieldValueAt(clip, ax, ay, az);
  const fb = fieldValueAt(clip, bx, by, bz);

  if (!clip.thinShell) {
    edgeIntersection(ax, ay, az, bx, by, bz, fa, fb, clip.iso, out, offset);
    return true;
  }

  const steps = 8;
  let prevT = 0;
  let prevV = fa;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const v = fieldValueAt(clip, ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
    if ((prevV - clip.iso) * (v - clip.iso) < 0) {
      edgeIntersection(
        ax,
        ay,
        az,
        bx,
        by,
        bz,
        prevV,
        v,
        clip.iso,
        out,
        offset,
        prevT,
        t
      );
      return true;
    }
    prevT = t;
    prevV = v;
  }

  return false;
};

/** Clips one triangle with per-sample solid tests (used after thin-shell subdivision). */
const clipTriangleSampled = (
  clip: ClipRuntime,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  inside: TriangleWriter,
  outside: TriangleWriter
): void => {
  const sa = isSolidAt(clip, ax, ay, az);
  const sb = isSolidAt(clip, bx, by, bz);
  const sc = isSolidAt(clip, cx, cy, cz);
  const solidCount = (sa ? 1 : 0) + (sb ? 1 : 0) + (sc ? 1 : 0);

  if (solidCount === 0) {
    outside.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    return;
  }

  if (solidCount === 3) {
    inside.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    return;
  }

  let tax = ax;
  let tay = ay;
  let taz = az;
  let tbx = bx;
  let tby = by;
  let tbz = bz;
  let tcx = cx;
  let tcy = cy;
  let tcz = cz;

  if (solidCount === 1) {
    if (sb && !sa && !sc) {
      tax = bx;
      tay = by;
      taz = bz;
      tbx = cx;
      tby = cy;
      tbz = cz;
      tcx = ax;
      tcy = ay;
      tcz = az;
    } else if (!sa && !sb && sc) {
      tax = cx;
      tay = cy;
      taz = cz;
      tbx = ax;
      tby = ay;
      tbz = az;
      tcx = bx;
      tcy = by;
      tcz = bz;
    }

    writeIsoEdgePoint(clip, tax, tay, taz, tbx, tby, tbz, thinShellEdgePoint, 0);
    writeIsoEdgePoint(clip, tax, tay, taz, tcx, tcy, tcz, thinShellEdgePoint, 3);
    inside.push(
      tax,
      tay,
      taz,
      thinShellEdgePoint[0],
      thinShellEdgePoint[1],
      thinShellEdgePoint[2],
      thinShellEdgePoint[3],
      thinShellEdgePoint[4],
      thinShellEdgePoint[5]
    );
    outside.push(
      thinShellEdgePoint[0],
      thinShellEdgePoint[1],
      thinShellEdgePoint[2],
      tbx,
      tby,
      tbz,
      tcx,
      tcy,
      tcz
    );
    outside.push(
      thinShellEdgePoint[0],
      thinShellEdgePoint[1],
      thinShellEdgePoint[2],
      tcx,
      tcy,
      tcz,
      thinShellEdgePoint[3],
      thinShellEdgePoint[4],
      thinShellEdgePoint[5]
    );
    return;
  }

  if (!sc && sa && sb) {
    tax = ax;
    tay = ay;
    taz = az;
    tbx = bx;
    tby = by;
    tbz = bz;
    tcx = cx;
    tcy = cy;
    tcz = cz;
  } else if (!sb && sa && sc) {
    tax = ax;
    tay = ay;
    taz = az;
    tbx = cx;
    tby = cy;
    tbz = cz;
    tcx = bx;
    tcy = by;
    tcz = bz;
  } else {
    tax = bx;
    tay = by;
    taz = bz;
    tbx = cx;
    tby = cy;
    tbz = cz;
    tcx = ax;
    tcy = ay;
    tcz = az;
  }

  writeIsoEdgePoint(clip, tax, tay, taz, tcx, tcy, tcz, thinShellEdgePoint, 0);
  writeIsoEdgePoint(clip, tbx, tby, tbz, tcx, tcy, tcz, thinShellEdgePoint, 3);
  outside.push(
    tcx,
    tcy,
    tcz,
    thinShellEdgePoint[0],
    thinShellEdgePoint[1],
    thinShellEdgePoint[2],
    thinShellEdgePoint[3],
    thinShellEdgePoint[4],
    thinShellEdgePoint[5]
  );
  inside.push(tax, tay, taz, tbx, tby, tbz, thinShellEdgePoint[3], thinShellEdgePoint[4], thinShellEdgePoint[5]);
  inside.push(tax, tay, taz, thinShellEdgePoint[3], thinShellEdgePoint[4], thinShellEdgePoint[5], thinShellEdgePoint[0], thinShellEdgePoint[1], thinShellEdgePoint[2]);
};

const subdivideThinShellTriangle = (
  clip: ClipRuntime,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  depth: number,
  inside: TriangleWriter,
  outside: TriangleWriter
): void => {
  const abx = (ax + bx) * 0.5;
  const aby = (ay + by) * 0.5;
  const abz = (az + bz) * 0.5;
  const bcx = (bx + cx) * 0.5;
  const bcy = (by + cy) * 0.5;
  const bcz = (bz + cz) * 0.5;
  const cax = (cx + ax) * 0.5;
  const cay = (cy + ay) * 0.5;
  const caz = (cz + az) * 0.5;
  const next = depth + 1;

  clipThinShellTriangle(clip, ax, ay, az, abx, aby, abz, cax, cay, caz, next, inside, outside);
  clipThinShellTriangle(clip, bx, by, bz, bcx, bcy, bcz, abx, aby, abz, next, inside, outside);
  clipThinShellTriangle(clip, cx, cy, cz, cax, cay, caz, bcx, bcy, bcz, next, inside, outside);
  clipThinShellTriangle(clip, abx, aby, abz, bcx, bcy, bcz, cax, cay, caz, next, inside, outside);
};

const clipThinShellTriangle = (
  clip: ClipRuntime,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  depth: number,
  inside: TriangleWriter,
  outside: TriangleWriter
): void => {
  const maxDepth = thinShellMaxDepth(clip);
  const sa = isSolidAt(clip, ax, ay, az);
  const sb = isSolidAt(clip, bx, by, bz);
  const sc = isSolidAt(clip, cx, cy, cz);
  const solidCount = (sa ? 1 : 0) + (sb ? 1 : 0) + (sc ? 1 : 0);

  if (solidCount === 0) {
    if (!triangleMayIntersectThinSolid(clip, ax, ay, az, bx, by, bz, cx, cy, cz)) {
      outside.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      return;
    }
    if (depth >= maxDepth) {
      outside.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      return;
    }

    subdivideThinShellTriangle(clip, ax, ay, az, bx, by, bz, cx, cy, cz, depth, inside, outside);
    return;
  }

  if (solidCount === 3) {
    inside.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    return;
  }

  if (
    depth < maxDepth &&
    clip.thinShell &&
    solidCount !== 0 &&
    maxTriangleEdgeLength(ax, ay, az, bx, by, bz, cx, cy, cz) > thinShellEdgeLimit(clip)
  ) {
    subdivideThinShellTriangle(clip, ax, ay, az, bx, by, bz, cx, cy, cz, depth, inside, outside);
    return;
  }

  clipTriangleSampled(clip, ax, ay, az, bx, by, bz, cx, cy, cz, inside, outside);
};

const edgeIntersection = (
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  fa: number,
  fb: number,
  iso: number,
  out: Float32Array,
  offset: number,
  t0 = 0,
  t1 = 1
) => {
  const denom = fb - fa;
  const tLocal = Math.abs(denom) < 1e-12 ? 0.5 : (iso - fa) / denom;
  const clamped = tLocal < 0 ? 0 : tLocal > 1 ? 1 : tLocal;
  const t = t0 + (t1 - t0) * clamped;
  out[offset] = ax + (bx - ax) * t;
  out[offset + 1] = ay + (by - ay) * t;
  out[offset + 2] = az + (bz - az) * t;
};

const assignGeometryBuffers = (
  existing: BufferGeometry | null,
  positions: Float32Array,
  normals: Float32Array,
  vertexCount: number
): BufferGeometry | null => {
  if (vertexCount === 0) return null;

  const byteLength = vertexCount * 3;
  const positionArray = positions.subarray(0, byteLength);
  const normalArray = normals.subarray(0, byteLength);

  if (existing) {
    const positionAttr = existing.getAttribute('position') as BufferAttribute;
    const normalAttr = existing.getAttribute('normal') as BufferAttribute | undefined;
    if (positionAttr.count === vertexCount && normalAttr?.count === vertexCount) {
      (positionAttr.array as Float32Array).set(positionArray);
      (normalAttr.array as Float32Array).set(normalArray);
      positionAttr.needsUpdate = true;
      normalAttr.needsUpdate = true;
      existing.setDrawRange(0, vertexCount);
      return existing;
    }
    existing.dispose();
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positionArray), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normalArray), 3));
  return geometry;
};

class TriangleWriter {
  positions!: Float32Array;
  normals!: Float32Array;
  private vertexCount = 0;

  reset(triangleEstimate: number) {
    const capacity = Math.max(triangleEstimate, 1) * 9;
    if (!this.positions || this.positions.length !== capacity) {
      this.positions = new Float32Array(capacity);
      this.normals = new Float32Array(capacity);
    }
    this.vertexCount = 0;
  }

  push(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number
  ) {
    const offset = this.vertexCount;
    if (offset + 9 > this.positions.length) {
      const expanded = new Float32Array(this.positions.length * 2);
      expanded.set(this.positions);
      this.positions = expanded;
      const expandedNormals = new Float32Array(this.normals.length * 2);
      expandedNormals.set(this.normals);
      this.normals = expandedNormals;
    }

    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    this.positions[offset] = ax;
    this.positions[offset + 1] = ay;
    this.positions[offset + 2] = az;
    this.positions[offset + 3] = bx;
    this.positions[offset + 4] = by;
    this.positions[offset + 5] = bz;
    this.positions[offset + 6] = cx;
    this.positions[offset + 7] = cy;
    this.positions[offset + 8] = cz;

    this.normals[offset] = nx;
    this.normals[offset + 1] = ny;
    this.normals[offset + 2] = nz;
    this.normals[offset + 3] = nx;
    this.normals[offset + 4] = ny;
    this.normals[offset + 5] = nz;
    this.normals[offset + 6] = nx;
    this.normals[offset + 7] = ny;
    this.normals[offset + 8] = nz;

    this.vertexCount += 9;
  }

  toGeometry(existing: BufferGeometry | null) {
    return assignGeometryBuffers(existing, this.positions, this.normals, this.vertexCount / 3);
  }
}

class EdgeCache {
  points: Float32Array = new Float32Array(0);
  private offsets = new Map<number, number>();

  clear() {
    this.offsets.clear();
  }

  getOrCreate(i: number, j: number, positions: Float32Array, clip: ClipRuntime): number {
    const key = edgeKey(i, j);
    const cached = this.offsets.get(key);
    if (cached !== undefined) return cached;

    const ii = i * 3;
    const ji = j * 3;
    const ax = positions[ii];
    const ay = positions[ii + 1];
    const az = positions[ii + 2];
    const bx = positions[ji];
    const by = positions[ji + 1];
    const bz = positions[ji + 2];

    const offset = this.offsets.size * 3;
    if (offset + 3 > this.points.length) {
      const expanded = new Float32Array(Math.max(this.points.length * 2, offset + 96));
      expanded.set(this.points);
      this.points = expanded;
    }

    edgeIntersection(
      ax,
      ay,
      az,
      bx,
      by,
      bz,
      sampleAt(clip, ax, ay, az),
      sampleAt(clip, bx, by, bz),
      clip.iso,
      this.points,
      offset
    );
    this.offsets.set(key, offset);
    return offset;
  }
}

const clipBuffers = {
  inside: new TriangleWriter(),
  outside: new TriangleWriter(),
  edgeCache: new EdgeCache()
};

const clipTriangle = (
  clip: ClipRuntime,
  ia: number,
  ib: number,
  ic: number,
  positions: Float32Array,
  vertexSolid: Uint8Array,
  edgeCache: EdgeCache,
  inside: TriangleWriter,
  outside: TriangleWriter
) => {
  const ai = ia * 3;
  const bi = ib * 3;
  const ci = ic * 3;

  const ax = positions[ai];
  const ay = positions[ai + 1];
  const az = positions[ai + 2];
  const bx = positions[bi];
  const by = positions[bi + 1];
  const bz = positions[bi + 2];
  const cx = positions[ci];
  const cy = positions[ci + 1];
  const cz = positions[ci + 2];

  let i0 = ia;
  let i1 = ib;
  let i2 = ic;
  let tax = ax;
  let tay = ay;
  let taz = az;
  let tbx = bx;
  let tby = by;
  let tbz = bz;
  let tcx = cx;
  let tcy = cy;
  let tcz = cz;

  const sa = vertexSolid[ia] === 1;
  const sb = vertexSolid[ib] === 1;
  const sc = vertexSolid[ic] === 1;
  const solidCount = vertexSolid[ia] + vertexSolid[ib] + vertexSolid[ic];

  if (solidCount === 0) {
    if (triangleMayIntersectThinSolid(clip, ax, ay, az, bx, by, bz, cx, cy, cz)) {
      clipThinShellTriangle(clip, ax, ay, az, bx, by, bz, cx, cy, cz, 0, inside, outside);
      return;
    }
    outside.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    return;
  }

  if (solidCount === 3) {
    inside.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    return;
  }

  if (solidCount === 1) {
    if (sb && !sa && !sc) {
      i0 = ib;
      i1 = ic;
      i2 = ia;
      tax = bx;
      tay = by;
      taz = bz;
      tbx = cx;
      tby = cy;
      tbz = cz;
      tcx = ax;
      tcy = ay;
      tcz = az;
    } else if (!sa && !sb && sc) {
      i0 = ic;
      i1 = ia;
      i2 = ib;
      tax = cx;
      tay = cy;
      taz = cz;
      tbx = ax;
      tby = ay;
      tbz = az;
      tcx = bx;
      tcy = by;
      tcz = bz;
    } else {
      tax = ax;
      tay = ay;
      taz = az;
      tbx = bx;
      tby = by;
      tbz = bz;
      tcx = cx;
      tcy = cy;
      tcz = cz;
    }

    const p01 = edgeCache.getOrCreate(i0, i1, positions, clip);
    const p02 = edgeCache.getOrCreate(i0, i2, positions, clip);
    const edgePoints = edgeCache.points;
    inside.push(tax, tay, taz, edgePoints[p01], edgePoints[p01 + 1], edgePoints[p01 + 2], edgePoints[p02], edgePoints[p02 + 1], edgePoints[p02 + 2]);
    outside.push(edgePoints[p01], edgePoints[p01 + 1], edgePoints[p01 + 2], tbx, tby, tbz, tcx, tcy, tcz);
    outside.push(edgePoints[p01], edgePoints[p01 + 1], edgePoints[p01 + 2], tcx, tcy, tcz, edgePoints[p02], edgePoints[p02 + 1], edgePoints[p02 + 2]);
    return;
  }

  if (!sc && sa && sb) {
    tax = ax;
    tay = ay;
    taz = az;
    tbx = bx;
    tby = by;
    tbz = bz;
    tcx = cx;
    tcy = cy;
    tcz = cz;
  } else if (!sb && sa && sc) {
    i1 = ic;
    i2 = ib;
    tax = ax;
    tay = ay;
    taz = az;
    tbx = cx;
    tby = cy;
    tbz = cz;
    tcx = bx;
    tcy = by;
    tcz = bz;
  } else {
    i0 = ib;
    i1 = ic;
    i2 = ia;
    tax = bx;
    tay = by;
    taz = bz;
    tbx = cx;
    tby = cy;
    tbz = cz;
    tcx = ax;
    tcy = ay;
    tcz = az;
  }

  const p0c = edgeCache.getOrCreate(i0, i2, positions, clip);
  const p1c = edgeCache.getOrCreate(i1, i2, positions, clip);
  const edgePoints = edgeCache.points;
  outside.push(tcx, tcy, tcz, edgePoints[p0c], edgePoints[p0c + 1], edgePoints[p0c + 2], edgePoints[p1c], edgePoints[p1c + 1], edgePoints[p1c + 2]);
  inside.push(tax, tay, taz, tbx, tby, tbz, edgePoints[p1c], edgePoints[p1c + 1], edgePoints[p1c + 2]);
  inside.push(tax, tay, taz, edgePoints[p1c], edgePoints[p1c + 1], edgePoints[p1c + 2], edgePoints[p0c], edgePoints[p0c + 1], edgePoints[p0c + 2]);
};

/**
 * Repeatedly splits long edges at shared midpoints until every edge is below
 * `maxEdgeLength`. Keeps the mesh watertight so the edge-cache clipper stays gap-free.
 *
 * @param {BufferGeometry} geometry - indexed triangle mesh
 * @param {number} maxEdgeLength - longest allowed edge in mm
 * @returns {BufferGeometry} subdivided mesh (caller owns disposal)
 */
export const subdivideLongEdges = (geometry: BufferGeometry, maxEdgeLength: number): BufferGeometry => {
  const positionAttr = geometry.getAttribute('position') as BufferAttribute;
  const indexAttr = geometry.getIndex();
  if (!indexAttr) return geometry.clone();

  let positions = positionAttr.array as Float32Array;
  let vertexCount = positions.length / 3;
  let indices = copyIndices(indexAttr);
  let indexCount = indices.length;

  const maxEdgeLengthSq = maxEdgeLength * maxEdgeLength;

  for (let pass = 0; pass < 12; pass++) {
    const edgesToSplit = new Set<number>();

    for (let t = 0; t < indexCount; t += 3) {
      const ia = indices[t];
      const ib = indices[t + 1];
      const ic = indices[t + 2];
      const ax = positions[ia * 3];
      const ay = positions[ia * 3 + 1];
      const az = positions[ia * 3 + 2];
      const bx = positions[ib * 3];
      const by = positions[ib * 3 + 1];
      const bz = positions[ib * 3 + 2];
      const cx = positions[ic * 3];
      const cy = positions[ic * 3 + 1];
      const cz = positions[ic * 3 + 2];
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      if (dx * dx + dy * dy + dz * dz > maxEdgeLengthSq) edgesToSplit.add(edgeKey(ia, ib));
      const dx2 = cx - bx;
      const dy2 = cy - by;
      const dz2 = cz - bz;
      if (dx2 * dx2 + dy2 * dy2 + dz2 * dz2 > maxEdgeLengthSq) edgesToSplit.add(edgeKey(ib, ic));
      const dx3 = ax - cx;
      const dy3 = ay - cy;
      const dz3 = az - cz;
      if (dx3 * dx3 + dy3 * dy3 + dz3 * dz3 > maxEdgeLengthSq) edgesToSplit.add(edgeKey(ic, ia));
    }

    if (edgesToSplit.size === 0) break;

    if (
      vertexCount > MAX_SUBDIVISION_VERTICES ||
      indexCount > MAX_SUBDIVISION_INDICES ||
      vertexCount + edgesToSplit.size > MAX_SUBDIVISION_VERTICES
    ) {
      break;
    }

    const edgeMid = new Map<number, number>();
    const newVertexCount = vertexCount + edgesToSplit.size;
    const expanded = new Float32Array(newVertexCount * 3);
    expanded.set(positions);

    let nextVertex = vertexCount;
    for (const key of edgesToSplit) {
      const { a, b } = decodeEdgeKey(key);
      const ai = a * 3;
      const bi = b * 3;
      const ni = nextVertex * 3;
      expanded[ni] = (expanded[ai] + expanded[bi]) * 0.5;
      expanded[ni + 1] = (expanded[ai + 1] + expanded[bi + 1]) * 0.5;
      expanded[ni + 2] = (expanded[ai + 2] + expanded[bi + 2]) * 0.5;
      edgeMid.set(key, nextVertex++);
    }

    positions = expanded;
    vertexCount = nextVertex;

    const getMidpoint = (a: number, b: number) => edgeMid.get(edgeKey(a, b))!;

    const nextIndices = new Uint32Array(indexCount * 4);
    let write = 0;

    const pushTri = (a: number, b: number, c: number) => {
      nextIndices[write++] = a;
      nextIndices[write++] = b;
      nextIndices[write++] = c;
    };

    for (let t = 0; t < indexCount; t += 3) {
      const ia = indices[t];
      const ib = indices[t + 1];
      const ic = indices[t + 2];
      const keyAB = edgeKey(ia, ib);
      const keyBC = edgeKey(ib, ic);
      const keyCA = edgeKey(ic, ia);
      const splitAB = edgesToSplit.has(keyAB);
      const splitBC = edgesToSplit.has(keyBC);
      const splitCA = edgesToSplit.has(keyCA);

      if (!splitAB && !splitBC && !splitCA) {
        pushTri(ia, ib, ic);
        continue;
      }

      if (splitAB && splitBC && splitCA) {
        const mAB = getMidpoint(ia, ib);
        const mBC = getMidpoint(ib, ic);
        const mCA = getMidpoint(ic, ia);
        pushTri(ia, mAB, mCA);
        pushTri(mAB, ib, mBC);
        pushTri(mCA, mBC, ic);
        pushTri(mAB, mBC, mCA);
        continue;
      }

      if (splitAB && splitBC) {
        const mAB = getMidpoint(ia, ib);
        const mBC = getMidpoint(ib, ic);
        pushTri(ia, mAB, ic);
        pushTri(mAB, ib, mBC);
        pushTri(mAB, mBC, ic);
        continue;
      }

      if (splitBC && splitCA) {
        const mBC = getMidpoint(ib, ic);
        const mCA = getMidpoint(ic, ia);
        pushTri(ib, mBC, ia);
        pushTri(mBC, ic, mCA);
        pushTri(mBC, mCA, ia);
        continue;
      }

      if (splitCA && splitAB) {
        const mCA = getMidpoint(ic, ia);
        const mAB = getMidpoint(ia, ib);
        pushTri(ic, mCA, ib);
        pushTri(mCA, ia, mAB);
        pushTri(mCA, mAB, ib);
        continue;
      }

      if (splitAB) {
        const mAB = getMidpoint(ia, ib);
        pushTri(ia, mAB, ic);
        pushTri(mAB, ib, ic);
        continue;
      }

      if (splitBC) {
        const mBC = getMidpoint(ib, ic);
        pushTri(ib, mBC, ia);
        pushTri(mBC, ic, ia);
        continue;
      }

      const mCA = getMidpoint(ic, ia);
      pushTri(ic, mCA, ib);
      pushTri(mCA, ia, ib);
    }

    indices = nextIndices.subarray(0, write);
    indexCount = write;
  }

  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(positions, 3));
  result.setIndex(new Uint32BufferAttribute(indices.slice(), 1));
  return result;
};

const refineDemoEdgeLimit = (sourceTriangles: number, maxCellSize: number): number => {
  let edgeLimit = maxCellSize;

  if (sourceTriangles > 10_000) {
    edgeLimit *= Math.sqrt(sourceTriangles / 10_000);
  }

  return edgeLimit;
};

/**
 * Merges vertices and subdivides long edges so clipping stays watertight at the field resolution.
 *
 * @param {BufferGeometry} demoGeometry - demo object mesh in printer space
 * @param {number} maxCellSize - longest allowed edge in mm
 * @returns {BufferGeometry} prepared mesh (caller owns disposal)
 */
export const getPreparedDemoMesh = (demoGeometry: BufferGeometry, maxCellSize: number): BufferGeometry => {
  const merged = demoGeometry.getIndex() ? null : mergeVertices(demoGeometry.clone());
  const source = merged ?? demoGeometry;
  const sourceTriangles = source.getIndex()!.count / 3;

  let edgeLimit = refineDemoEdgeLimit(sourceTriangles, maxCellSize);

  for (let attempt = 0; attempt < 6; attempt++) {
    const prepared = subdivideLongEdges(source, edgeLimit);
    if (prepared.getIndex()!.count / 3 <= MAX_PREPARED_DEMO_TRIANGLES) {
      merged?.dispose();
      return prepared;
    }
    prepared.dispose();
    edgeLimit *= 1.35;
  }

  const prepared = subdivideLongEdges(source, edgeLimit);
  merged?.dispose();
  return prepared;
};

/**
 * Clips a prepared demo mesh against the pattern field without re-merging or subdividing.
 *
 * @param {BufferGeometry} preparedMesh - merged, subdivided demo mesh
 * @param {PatternField} field - pattern field sampler
 * @param {DemoClipReuse | undefined} reuse - optional existing geometries to repopulate
 * @returns {DemoClipResult} clipped geometries
 */
export const clipPreparedDemoMesh = (
  preparedMesh: BufferGeometry,
  field: PatternField,
  reuse?: DemoClipReuse
): DemoClipResult => {
  const index = preparedMesh.getIndex();
  if (!index) {
    const nonIndexed = preparedMesh.toNonIndexed();
    const result = clipPreparedDemoMesh(nonIndexed, field, reuse);
    nonIndexed.dispose();
    return result;
  }

  const clip = field.clipRuntime;
  const positions = (preparedMesh.getAttribute('position') as BufferAttribute).array as Float32Array;
  const triangleCount = index.count / 3;
  const inside = clipBuffers.inside;
  const outside = clipBuffers.outside;
  const edgeCache = clipBuffers.edgeCache;

  inside.reset(triangleCount);
  outside.reset(triangleCount);
  edgeCache.clear();

  const indices = index.array as Uint32Array | Uint16Array;
  const indexLength = index.count;

  // Classify each unique mesh vertex once (vertices are shared by many triangles, and the analytic field
  // sample can be expensive), then look up the cached result while clipping.
  const vertexCount = positions.length / 3;
  const vertexSolid = new Uint8Array(vertexCount);
  for (let v = 0, p = 0; v < vertexCount; v++, p += 3) {
    vertexSolid[v] = isSolidAt(clip, positions[p], positions[p + 1], positions[p + 2]) ? 1 : 0;
  }

  const clipTriangleThinShell = (ia: number, ib: number, ic: number) => {
    const ai = ia * 3;
    const bi = ib * 3;
    const ci = ic * 3;
    clipThinShellTriangle(
      clip,
      positions[ai],
      positions[ai + 1],
      positions[ai + 2],
      positions[bi],
      positions[bi + 1],
      positions[bi + 2],
      positions[ci],
      positions[ci + 1],
      positions[ci + 2],
      0,
      inside,
      outside
    );
  };

  const clipIndexedTriangle = (ia: number, ib: number, ic: number) => {
    if (clip.thinShell) {
      const solidCount = vertexSolid[ia] + vertexSolid[ib] + vertexSolid[ic];
      if (solidCount === 3) {
        const ai = ia * 3;
        const bi = ib * 3;
        const ci = ic * 3;
        inside.push(
          positions[ai],
          positions[ai + 1],
          positions[ai + 2],
          positions[bi],
          positions[bi + 1],
          positions[bi + 2],
          positions[ci],
          positions[ci + 1],
          positions[ci + 2]
        );
        return;
      }
      if (solidCount === 0) {
        const ai = ia * 3;
        const bi = ib * 3;
        const ci = ic * 3;
        if (
          !triangleMayIntersectThinSolid(
            clip,
            positions[ai],
            positions[ai + 1],
            positions[ai + 2],
            positions[bi],
            positions[bi + 1],
            positions[bi + 2],
            positions[ci],
            positions[ci + 1],
            positions[ci + 2]
          )
        ) {
          outside.push(
            positions[ai],
            positions[ai + 1],
            positions[ai + 2],
            positions[bi],
            positions[bi + 1],
            positions[bi + 2],
            positions[ci],
            positions[ci + 1],
            positions[ci + 2]
          );
          return;
        }
      }
      clipTriangleThinShell(ia, ib, ic);
      return;
    }

    clipTriangle(clip, ia, ib, ic, positions, vertexSolid, edgeCache, inside, outside);
  };

  if (indices instanceof Uint32Array) {
    for (let t = 0; t < indexLength; t += 3) {
      clipIndexedTriangle(indices[t], indices[t + 1], indices[t + 2]);
    }
  } else {
    for (let t = 0; t < indexLength; t += 3) {
      clipIndexedTriangle(indices[t], indices[t + 1], indices[t + 2]);
    }
  }

  return {
    inside: inside.toGeometry(reuse?.inside ?? null),
    outside: outside.toGeometry(reuse?.outside ?? null)
  };
};

/**
 * Splits demo geometry into solid-pattern and inverse-pattern portions by clipping
 * each triangle against the pattern field (same iso surface as export).
 *
 * @param {BufferGeometry} demoGeometry - demo object mesh in printer space
 * @param {PatternField} field - pattern field sampler
 * @returns {DemoClipResult} clipped geometries
 */
export const clipDemoWithField = (demoGeometry: BufferGeometry, field: PatternField): DemoClipResult => {
  const prepared = getPreparedDemoMesh(demoGeometry, field.maxCellSize);
  const result = clipPreparedDemoMesh(prepared, field);
  if (prepared !== demoGeometry) prepared.dispose();
  return result;
};

import { BufferAttribute, BufferGeometry, Uint32BufferAttribute } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { ClipField, PatternField } from '../generate/patternField';

export interface DemoClipResult {
  inside: BufferGeometry | null;
  outside: BufferGeometry | null;
}

export interface DemoClipReuse {
  inside: BufferGeometry | null;
  outside: BufferGeometry | null;
}

const EDGE_KEY_SCALE = 2_097_152;

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

interface Point3 {
  x: number;
  y: number;
  z: number;
}

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
  out: Point3
) => {
  const denom = fb - fa;
  const t = Math.abs(denom) < 1e-12 ? 0.5 : (iso - fa) / denom;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  out.x = ax + (bx - ax) * clamped;
  out.y = ay + (by - ay) * clamped;
  out.z = az + (bz - az) * clamped;
};

const isSolidAt = (clip: ClipField, x: number, y: number, z: number) =>
  x >= clip.minX &&
  x <= clip.maxX &&
  y >= clip.minY &&
  y <= clip.maxY &&
  z >= clip.minZ &&
  z <= clip.maxZ &&
  clip.sample(x, y, z) >= clip.iso;

const assignGeometryBuffers = (
  existing: BufferGeometry | null,
  positions: Float32Array,
  normals: Float32Array,
  vertexCount: number
): BufferGeometry | null => {
  if (vertexCount === 0) return null;

  const positionArray = positions.subarray(0, vertexCount * 3);
  const normalArray = normals.subarray(0, vertexCount * 3);

  if (existing) {
    const positionAttr = existing.getAttribute('position') as BufferAttribute;
    const normalAttr = existing.getAttribute('normal') as BufferAttribute;
    if (positionAttr.count === vertexCount) {
      (positionAttr.array as Float32Array).set(positionArray);
      (normalAttr.array as Float32Array).set(normalArray);
      positionAttr.needsUpdate = true;
      normalAttr.needsUpdate = true;
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
  private positions: Float32Array;
  private normals: Float32Array;
  private vertexCount = 0;

  constructor(triangleEstimate: number) {
    const capacity = triangleEstimate * 3;
    this.positions = new Float32Array(capacity * 3);
    this.normals = new Float32Array(capacity * 3);
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
    if (this.vertexCount + 3 > this.positions.length / 3) {
      this.grow();
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

    const offset = this.vertexCount * 3;
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

    this.vertexCount += 3;
  }

  toGeometry(existing: BufferGeometry | null) {
    return assignGeometryBuffers(existing, this.positions, this.normals, this.vertexCount);
  }

  private grow() {
    const nextCapacity = this.positions.length * 2;
    const nextPositions = new Float32Array(nextCapacity);
    const nextNormals = new Float32Array(nextCapacity);
    nextPositions.set(this.positions);
    nextNormals.set(this.normals);
    this.positions = nextPositions;
    this.normals = nextNormals;
  }
}

class EdgeCache {
  private points = new Map<number, Point3>();

  getOrCreate(
    i: number,
    j: number,
    positions: Float32Array,
    clip: ClipField
  ): Point3 {
    const key = edgeKey(i, j);
    const cached = this.points.get(key);
    if (cached) return cached;

    const ii = i * 3;
    const ji = j * 3;
    const ax = positions[ii];
    const ay = positions[ii + 1];
    const az = positions[ii + 2];
    const bx = positions[ji];
    const by = positions[ji + 1];
    const bz = positions[ji + 2];

    const point: Point3 = { x: 0, y: 0, z: 0 };
    edgeIntersection(
      ax,
      ay,
      az,
      bx,
      by,
      bz,
      clip.sample(ax, ay, az),
      clip.sample(bx, by, bz),
      clip.iso,
      point
    );
    this.points.set(key, point);
    return point;
  }
}

const clipTriangle = (
  clip: ClipField,
  ia: number,
  ib: number,
  ic: number,
  positions: Float32Array,
  edgeCache: EdgeCache,
  inside: TriangleWriter,
  outside: TriangleWriter
) => {
  const ai = ia * 3;
  const bi = ib * 3;
  const ci = ic * 3;

  let ax = positions[ai];
  let ay = positions[ai + 1];
  let az = positions[ai + 2];
  let bx = positions[bi];
  let by = positions[bi + 1];
  let bz = positions[bi + 2];
  let cx = positions[ci];
  let cy = positions[ci + 1];
  let cz = positions[ci + 2];
  let i0 = ia;
  let i1 = ib;
  let i2 = ic;

  const sa = isSolidAt(clip, ax, ay, az);
  const sb = isSolidAt(clip, bx, by, bz);
  const sc = isSolidAt(clip, cx, cy, cz);
  const solidCount = Number(sa) + Number(sb) + Number(sc);

  if (solidCount === 0) {
    outside.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    return;
  }

  if (solidCount === 3) {
    inside.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    return;
  }

  if (solidCount === 1) {
    if (sb && !sa && !sc) {
      ax = positions[bi];
      ay = positions[bi + 1];
      az = positions[bi + 2];
      bx = positions[ci];
      by = positions[ci + 1];
      bz = positions[ci + 2];
      cx = positions[ai];
      cy = positions[ai + 1];
      cz = positions[ai + 2];
      i0 = ib;
      i1 = ic;
      i2 = ia;
    } else if (!sa && !sb && sc) {
      ax = positions[ci];
      ay = positions[ci + 1];
      az = positions[ci + 2];
      bx = positions[ai];
      by = positions[ai + 1];
      bz = positions[ai + 2];
      cx = positions[bi];
      cy = positions[bi + 1];
      cz = positions[bi + 2];
      i0 = ic;
      i1 = ia;
      i2 = ib;
    }

    const p01 = edgeCache.getOrCreate(i0, i1, positions, clip);
    const p02 = edgeCache.getOrCreate(i0, i2, positions, clip);
    inside.push(ax, ay, az, p01.x, p01.y, p01.z, p02.x, p02.y, p02.z);
    outside.push(p01.x, p01.y, p01.z, bx, by, bz, cx, cy, cz);
    outside.push(p01.x, p01.y, p01.z, cx, cy, cz, p02.x, p02.y, p02.z);
    return;
  }

  if (!sc && sa && sb) {
    // keep orientation
  } else if (!sb && sa && sc) {
    bx = positions[ci];
    by = positions[ci + 1];
    bz = positions[ci + 2];
    cx = positions[bi];
    cy = positions[bi + 1];
    cz = positions[bi + 2];
    i1 = ic;
    i2 = ib;
  } else {
    ax = positions[bi];
    ay = positions[bi + 1];
    az = positions[bi + 2];
    bx = positions[ci];
    by = positions[ci + 1];
    bz = positions[ci + 2];
    cx = positions[ai];
    cy = positions[ai + 1];
    cz = positions[ai + 2];
    i0 = ib;
    i1 = ic;
    i2 = ia;
  }

  const p0c = edgeCache.getOrCreate(i0, i2, positions, clip);
  const p1c = edgeCache.getOrCreate(i1, i2, positions, clip);
  outside.push(cx, cy, cz, p0c.x, p0c.y, p0c.z, p1c.x, p1c.y, p1c.z);
  inside.push(ax, ay, az, bx, by, bz, p1c.x, p1c.y, p1c.z);
  inside.push(ax, ay, az, p1c.x, p1c.y, p1c.z, p0c.x, p0c.y, p0c.z);
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

  const edgeLengthSq = (ia: number, ib: number) => {
    const ax = positions[ia * 3];
    const ay = positions[ia * 3 + 1];
    const az = positions[ia * 3 + 2];
    const bx = positions[ib * 3];
    const by = positions[ib * 3 + 1];
    const bz = positions[ib * 3 + 2];
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    return dx * dx + dy * dy + dz * dz;
  };

  for (let pass = 0; pass < 12; pass++) {
    const edgesToSplit = new Set<number>();

    for (let t = 0; t < indexCount; t += 3) {
      const ia = indices[t];
      const ib = indices[t + 1];
      const ic = indices[t + 2];
      if (edgeLengthSq(ia, ib) > maxEdgeLengthSq) edgesToSplit.add(edgeKey(ia, ib));
      if (edgeLengthSq(ib, ic) > maxEdgeLengthSq) edgesToSplit.add(edgeKey(ib, ic));
      if (edgeLengthSq(ic, ia) > maxEdgeLengthSq) edgesToSplit.add(edgeKey(ic, ia));
    }

    if (edgesToSplit.size === 0) break;

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

    const nextIndexCount = indexCount * 4;
    const nextIndices = new Uint32Array(nextIndexCount);
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
  result.setIndex(new Uint32BufferAttribute(new Uint32Array(indices), 1));
  return result;
};

/**
 * Merges vertices and subdivides long edges so clipping stays watertight at the field resolution.
 *
 * @param {BufferGeometry} demoGeometry - demo object mesh in printer space
 * @param {number} maxCellSize - longest allowed edge in mm
 * @returns {BufferGeometry} prepared mesh (caller owns disposal)
 */
export const getPreparedDemoMesh = (demoGeometry: BufferGeometry, maxCellSize: number): BufferGeometry => {
  const input = demoGeometry.getIndex() ? demoGeometry.clone() : mergeVertices(demoGeometry.clone());
  const subdivided = subdivideLongEdges(input, maxCellSize);
  input.dispose();
  return subdivided;
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

  const clip = field.clip;
  const positions = (preparedMesh.getAttribute('position') as BufferAttribute).array as Float32Array;
  const triangleCount = index.count / 3;
  const inside = new TriangleWriter(triangleCount);
  const outside = new TriangleWriter(triangleCount);
  const edgeCache = new EdgeCache();
  const indices = index.array as ArrayLike<number>;

  for (let t = 0; t < index.count; t += 3) {
    clipTriangle(
      clip,
      indices[t] as number,
      indices[t + 1] as number,
      indices[t + 2] as number,
      positions,
      edgeCache,
      inside,
      outside
    );
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
  prepared.dispose();
  return result;
};

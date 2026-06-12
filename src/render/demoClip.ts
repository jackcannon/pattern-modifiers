import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { PatternField } from '../generate/patternField';

export interface DemoClipResult {
  inside: BufferGeometry | null;
  outside: BufferGeometry | null;
}

const tempA = new Vector3();
const tempB = new Vector3();
const tempC = new Vector3();
const edgeTempA = new Vector3();
const edgeTempB = new Vector3();

const edgeKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const appendTriangle = (target: number[], a: Vector3, b: Vector3, c: Vector3) => {
  target.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
};

const edgeIntersection = (a: Vector3, b: Vector3, fa: number, fb: number, iso: number, out: Vector3) => {
  const denom = fb - fa;
  const t = Math.abs(denom) < 1e-12 ? 0.5 : (iso - fa) / denom;
  out.lerpVectors(a, b, Math.min(1, Math.max(0, t)));
};

const toGeometry = (positions: number[]): BufferGeometry | null => {
  if (positions.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
};

/**
 * Repeatedly splits long edges at shared midpoints until every edge is below
 * `maxEdgeLength`. Keeps the mesh watertight so the edge-cache clipper stays gap-free.
 *
 * @param {BufferGeometry} geometry - indexed triangle mesh
 * @param {number} maxEdgeLength - longest allowed edge in mm
 * @returns {BufferGeometry} subdivided mesh (caller owns disposal)
 */
const subdivideLongEdges = (geometry: BufferGeometry, maxEdgeLength: number): BufferGeometry => {
  const positionAttr = geometry.getAttribute('position') as BufferAttribute;
  const indexAttr = geometry.getIndex();
  if (!indexAttr) return geometry.clone();

  let positions = new Float32Array(positionAttr.array);
  let indices = Array.from(indexAttr.array as ArrayLike<number>);

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

  const maxEdgeLengthSq = maxEdgeLength * maxEdgeLength;

  for (let pass = 0; pass < 12; pass++) {
    const edgesToSplit = new Set<string>();

    for (let t = 0; t < indices.length; t += 3) {
      const ia = indices[t];
      const ib = indices[t + 1];
      const ic = indices[t + 2];
      if (edgeLengthSq(ia, ib) > maxEdgeLengthSq) edgesToSplit.add(edgeKey(ia, ib));
      if (edgeLengthSq(ib, ic) > maxEdgeLengthSq) edgesToSplit.add(edgeKey(ib, ic));
      if (edgeLengthSq(ic, ia) > maxEdgeLengthSq) edgesToSplit.add(edgeKey(ic, ia));
    }

    if (edgesToSplit.size === 0) break;

    const edgeMid = new Map<string, number>();
    const getMidpoint = (a: number, b: number) => {
      const key = edgeKey(a, b);
      const existing = edgeMid.get(key);
      if (existing !== undefined) return existing;

      const next = positions.length / 3;
      const expanded = new Float32Array(positions.length + 3);
      expanded.set(positions);
      expanded[next * 3] = (positions[a * 3] + positions[b * 3]) * 0.5;
      expanded[next * 3 + 1] = (positions[a * 3 + 1] + positions[b * 3 + 1]) * 0.5;
      expanded[next * 3 + 2] = (positions[a * 3 + 2] + positions[b * 3 + 2]) * 0.5;
      positions = expanded;
      edgeMid.set(key, next);
      return next;
    };

    const nextIndices: number[] = [];

    for (let t = 0; t < indices.length; t += 3) {
      const ia = indices[t];
      const ib = indices[t + 1];
      const ic = indices[t + 2];
      const splitAB = edgesToSplit.has(edgeKey(ia, ib));
      const splitBC = edgesToSplit.has(edgeKey(ib, ic));
      const splitCA = edgesToSplit.has(edgeKey(ic, ia));

      if (!splitAB && !splitBC && !splitCA) {
        nextIndices.push(ia, ib, ic);
        continue;
      }

      if (splitAB && splitBC && splitCA) {
        const mAB = getMidpoint(ia, ib);
        const mBC = getMidpoint(ib, ic);
        const mCA = getMidpoint(ic, ia);
        nextIndices.push(ia, mAB, mCA, mAB, ib, mBC, mCA, mBC, ic, mAB, mBC, mCA);
        continue;
      }

      if (splitAB && splitBC) {
        const mAB = getMidpoint(ia, ib);
        const mBC = getMidpoint(ib, ic);
        nextIndices.push(ia, mAB, ic, mAB, ib, mBC, mAB, mBC, ic);
        continue;
      }

      if (splitBC && splitCA) {
        const mBC = getMidpoint(ib, ic);
        const mCA = getMidpoint(ic, ia);
        nextIndices.push(ib, mBC, ia, mBC, ic, mCA, mBC, mCA, ia);
        continue;
      }

      if (splitCA && splitAB) {
        const mCA = getMidpoint(ic, ia);
        const mAB = getMidpoint(ia, ib);
        nextIndices.push(ic, mCA, ib, mCA, ia, mAB, mCA, mAB, ib);
        continue;
      }

      if (splitAB) {
        const mAB = getMidpoint(ia, ib);
        nextIndices.push(ia, mAB, ic, mAB, ib, ic);
        continue;
      }

      if (splitBC) {
        const mBC = getMidpoint(ib, ic);
        nextIndices.push(ib, mBC, ia, mBC, ic, ia);
        continue;
      }

      const mCA = getMidpoint(ic, ia);
      nextIndices.push(ic, mCA, ib, mCA, ia, ib);
    }

    indices = nextIndices;
  }

  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(positions, 3));
  result.setIndex(indices);
  return result;
};

class EdgeCache {
  private points = new Map<string, Vector3>();

  getOrCreate(i: number, j: number, position: BufferAttribute, field: PatternField): Vector3 {
    const key = edgeKey(i, j);
    const cached = this.points.get(key);
    if (cached) return cached;

    const point = new Vector3();
    edgeIntersection(
      edgeTempA.fromBufferAttribute(position, i),
      edgeTempB.fromBufferAttribute(position, j),
      field.noiseAt(edgeTempA.x, edgeTempA.y, edgeTempA.z),
      field.noiseAt(edgeTempB.x, edgeTempB.y, edgeTempB.z),
      field.iso,
      point
    );
    this.points.set(key, point);
    return point;
  }
}

interface TriangleVerts {
  ia: number;
  ib: number;
  ic: number;
  a: Vector3;
  b: Vector3;
  c: Vector3;
}

const loadTriangle = (position: BufferAttribute, ia: number, ib: number, ic: number): TriangleVerts => ({
  ia,
  ib,
  ic,
  a: tempA.fromBufferAttribute(position, ia),
  b: tempB.fromBufferAttribute(position, ib),
  c: tempC.fromBufferAttribute(position, ic)
});

const clipTriangle = (
  field: PatternField,
  ia: number,
  ib: number,
  ic: number,
  position: BufferAttribute,
  edgeCache: EdgeCache,
  inside: number[],
  outside: number[]
) => {
  let { a, b, c, ia: i0, ib: i1, ic: i2 } = loadTriangle(position, ia, ib, ic);

  const solid = (v: Vector3) => field.isSolid(v.x, v.y, v.z);
  const sa = solid(a);
  const sb = solid(b);
  const sc = solid(c);
  const solidCount = Number(sa) + Number(sb) + Number(sc);

  if (solidCount === 0) {
    appendTriangle(outside, a, b, c);
    return;
  }

  if (solidCount === 3) {
    appendTriangle(inside, a, b, c);
    return;
  }

  if (solidCount === 1) {
    if (sb && !sa && !sc) {
      ({ a, b, c, ia: i0, ib: i1, ic: i2 } = loadTriangle(position, ib, ic, ia));
    } else if (!sa && !sb && sc) {
      ({ a, b, c, ia: i0, ib: i1, ic: i2 } = loadTriangle(position, ic, ia, ib));
    }

    const p01 = edgeCache.getOrCreate(i0, i1, position, field);
    const p02 = edgeCache.getOrCreate(i0, i2, position, field);
    appendTriangle(inside, a, p01, p02);
    appendTriangle(outside, p01, b, c);
    appendTriangle(outside, p01, c, p02);
    return;
  }

  if (!sc && sa && sb) {
    ({ a, b, c, ia: i0, ib: i1, ic: i2 } = loadTriangle(position, ia, ib, ic));
  } else if (!sb && sa && sc) {
    ({ a, b, c, ia: i0, ib: i1, ic: i2 } = loadTriangle(position, ia, ic, ib));
  } else {
    ({ a, b, c, ia: i0, ib: i1, ic: i2 } = loadTriangle(position, ib, ic, ia));
  }

  const p0c = edgeCache.getOrCreate(i0, i2, position, field);
  const p1c = edgeCache.getOrCreate(i1, i2, position, field);
  appendTriangle(outside, c, p0c, p1c);
  appendTriangle(inside, a, b, p1c);
  appendTriangle(inside, a, p1c, p0c);
};

/**
 * Splits demo geometry into solid-pattern and inverse-pattern portions by clipping
 * each triangle against the continuous pattern field (same iso surface as export).
 *
 * @param {BufferGeometry} demoGeometry - demo object mesh in printer space
 * @param {PatternField} field - pattern field sampler
 * @returns {DemoClipResult} clipped geometries
 */
export const clipDemoWithField = (demoGeometry: BufferGeometry, field: PatternField): DemoClipResult => {
  const merged = mergeVertices(demoGeometry.clone());
  const subdivided = subdivideLongEdges(merged, field.maxCellSize);
  merged.dispose();

  const index = subdivided.getIndex();
  if (!index) {
    const nonIndexed = subdivided.toNonIndexed();
    subdivided.dispose();
    return clipDemoWithField(nonIndexed, field);
  }

  const position = subdivided.getAttribute('position') as BufferAttribute;
  const insidePositions: number[] = [];
  const outsidePositions: number[] = [];
  const edgeCache = new EdgeCache();
  const indices = index.array;

  for (let t = 0; t < indices.length; t += 3) {
    clipTriangle(field, indices[t], indices[t + 1], indices[t + 2], position, edgeCache, insidePositions, outsidePositions);
  }

  subdivided.dispose();

  return {
    inside: toGeometry(insidePositions),
    outside: toGeometry(outsidePositions)
  };
};

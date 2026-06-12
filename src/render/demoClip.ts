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

class EdgeCache {
  private points = new Map<string, Vector3>();

  getOrCreate(i: number, j: number, position: BufferAttribute, field: PatternField): Vector3 {
    const key = i < j ? `${i}|${j}` : `${j}|${i}`;
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
  let sa = solid(a);
  let sb = solid(b);
  let sc = solid(c);
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
  const working = demoGeometry.getIndex() ? demoGeometry : mergeVertices(demoGeometry.clone());
  const owned = working !== demoGeometry;

  const index = working.getIndex();
  if (!index) {
    const nonIndexed = working.toNonIndexed();
    if (owned) working.dispose();
    return clipDemoWithField(nonIndexed, field);
  }

  const position = working.getAttribute('position') as BufferAttribute;
  const insidePositions: number[] = [];
  const outsidePositions: number[] = [];
  const edgeCache = new EdgeCache();
  const indices = index.array;

  for (let t = 0; t < indices.length; t += 3) {
    clipTriangle(field, indices[t], indices[t + 1], indices[t + 2], position, edgeCache, insidePositions, outsidePositions);
  }

  if (owned) working.dispose();

  return {
    inside: toGeometry(insidePositions),
    outside: toGeometry(outsidePositions)
  };
};

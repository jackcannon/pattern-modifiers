// Sanity checks for the geometry pipeline. Run with: bun scripts/verify-geometry.ts
import { Mesh } from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

import { marchingCubes, GridSpec } from '../src/generate/marchingCubes';
import { generateGeometry } from '../src/generate/generate';
import { createDefaultFormObj } from '../src/form/schema';

// --- 1. sphere field: signed volume should be positive (outward normals) and close to analytic volume

const n = 33;
const grid: GridSpec = { nx: n, ny: n, nz: n, x0: -1, y0: -1, z0: -1, sx: 2 / (n - 1), sy: 2 / (n - 1), sz: 2 / (n - 1) };
const field = new Float32Array(n * n * n);
let idx = 0;
for (let k = 0; k < n; k++) {
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = grid.x0 + i * grid.sx;
      const y = grid.y0 + j * grid.sy;
      const z = grid.z0 + k * grid.sz;
      field[idx++] = 0.7 - Math.sqrt(x * x + y * y + z * z); // inside sphere r=0.7 => positive
    }
  }
}
const pos = marchingCubes(field, grid, 0);

const signedVolume = (p: Float32Array) => {
  let vol = 0;
  for (let t = 0; t < p.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = p.subarray(t, t + 9);
    vol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return vol;
};

const vol = signedVolume(pos);
const expected = (4 / 3) * Math.PI * 0.7 ** 3;
console.log(`sphere: tris=${pos.length / 9}, signedVolume=${vol.toFixed(4)}, analytic=${expected.toFixed(4)}`);
if (vol <= 0) throw new Error('FAIL: winding is inverted (negative volume)');
if (Math.abs(vol - expected) / expected > 0.05) throw new Error('FAIL: volume deviates >5% from analytic');

// --- 2. full pipeline: bounding box + watertightness

const form = { ...createDefaultFormObj(), width: 100, depth: 80, height: 60, overflow: 1, exportResolution: 64, seed: 1234 };
const geom = generateGeometry(form, form.exportResolution);
geom.computeBoundingBox();
const bb = geom.boundingBox!;
console.log(
  `bbox: x[${bb.min.x.toFixed(2)}, ${bb.max.x.toFixed(2)}] y[${bb.min.y.toFixed(2)}, ${bb.max.y.toFixed(2)}] z[${bb.min.z.toFixed(2)}, ${bb.max.z.toFixed(2)}]`
);
const close = (a: number, b: number) => Math.abs(a - b) < 1e-3;
if (!close(bb.min.x, -51) || !close(bb.max.x, 51)) throw new Error('FAIL: width bounds (expected ±51)');
if (!close(bb.min.y, -41) || !close(bb.max.y, 41)) throw new Error('FAIL: depth bounds (expected ±41)');
if (!close(bb.min.z, -1) || !close(bb.max.z, 61)) throw new Error('FAIL: height bounds (expected -1..61)');

// watertight check: every edge must be shared by exactly 2 triangles (opposite directions)
const positions = geom.getAttribute('position').array as Float32Array;
const edgeCounts = new Map<string, number>();
const keyOf = (x: number, y: number, z: number) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
for (let t = 0; t < positions.length; t += 9) {
  const verts = [0, 3, 6].map((o) => keyOf(positions[t + o], positions[t + o + 1], positions[t + o + 2]));
  for (let e = 0; e < 3; e++) {
    const a = verts[e];
    const b = verts[(e + 1) % 3];
    if (a === b) continue; // degenerate edge from coincident interpolated verts
    edgeCounts.set(`${a}|${b}`, (edgeCounts.get(`${a}|${b}`) ?? 0) + 1);
  }
}
let openEdges = 0;
for (const [key, count] of edgeCounts) {
  const reversed = key.split('|').reverse().join('|');
  if ((edgeCounts.get(reversed) ?? 0) !== count) openEdges++;
}
console.log(`pipeline: tris=${positions.length / 9}, volume=${(signedVolume(positions) / 1000).toFixed(1)}cm³, openEdges=${openEdges}`);
if (signedVolume(positions) <= 0) throw new Error('FAIL: pipeline volume negative');
if (openEdges > 0) throw new Error('FAIL: mesh is not watertight');

// --- 3. STL export smoke test

const exporter = new STLExporter();
const stl = exporter.parse(new Mesh(geom), { binary: true }) as unknown as DataView;
const triCount = stl.getUint32(80, true);
console.log(`stl: ${stl.byteLength} bytes, ${triCount} triangles`);
if (triCount !== positions.length / 9) throw new Error('FAIL: STL triangle count mismatch');

console.log('ALL CHECKS PASSED');

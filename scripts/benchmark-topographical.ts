// Topographical export benchmark + correctness checks. Run: bun scripts/benchmark-topographical.ts
import { buildTopographicalGeometry } from '../src/generate/patterns/topographicalPattern';
import { createDefaultFormObj } from '../src/form/schema';

const form = {
  ...createDefaultFormObj(),
  width: 100,
  depth: 80,
  height: 60,
  seed: 1234
};

const openEdges = (p: Float32Array) => {
  const ec = new Map<string, number>();
  const k = (x: number, y: number, z: number) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
  for (let t = 0; t < p.length; t += 9) {
    const v = [0, 3, 6].map((o) => k(p[t + o], p[t + o + 1], p[t + o + 2]));
    for (let e = 0; e < 3; e++) {
      const a = v[e];
      const b = v[(e + 1) % 3];
      if (a === b) continue;
      ec.set(`${a}|${b}`, (ec.get(`${a}|${b}`) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const [key, count] of ec) {
    const rev = key.split('|').reverse().join('|');
    if ((ec.get(rev) ?? 0) !== count) open++;
  }
  return open;
};

const bbox = (p: Float32Array) => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i];
    const y = p[i + 1];
    const z = p[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
};

const run = (res: number, runs: number) => {
  let positions: Float32Array | null = null;
  let ms = 0;
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    positions = buildTopographicalGeometry(form, res);
    ms += performance.now() - t0;
  }
  const p = positions!;
  const bb = bbox(p);
  const tris = p.length / 9;
  const open = openEdges(p);
  return { ms: ms / runs, tris, open, bb };
};

const warm = run(48, 1);
const r48 = run(48, 5);
const r64 = run(64, 3);

console.log(`warm tris=${warm.tris}`);
console.log(`res48: ${r48.ms.toFixed(0)}ms tris=${r48.tris} open=${r48.open} bbox x[${r48.bb.minX},${r48.bb.maxX}]`);
console.log(`res64: ${r64.ms.toFixed(0)}ms tris=${r64.tris} open=${r64.open}`);

if (r48.open !== 0 || r64.open !== 0) throw new Error('FAIL: open edges');
if (Math.abs(r48.bb.minX + 50) > 1e-3 || Math.abs(r48.bb.maxX - 50) > 1e-3) throw new Error('FAIL: bbox x');
if (Math.abs(r48.bb.minY + 40) > 1e-3 || Math.abs(r48.bb.maxY - 40) > 1e-3) throw new Error('FAIL: bbox y');
if (Math.abs(r48.bb.minZ) > 1e-3 || Math.abs(r48.bb.maxZ - 60) > 1e-3) throw new Error('FAIL: bbox z');

console.log('OK');

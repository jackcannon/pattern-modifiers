// Cross-hatch / parallel line export benchmark + field checksum. Run: bun scripts/benchmark-hatch.ts
import { createDefaultFormObj } from '../src/form/schema';
import { crosshatchPattern } from '../src/generate/patterns/crosshatchPattern';
import { parallelPattern } from '../src/generate/patterns/parallelPattern';

const baseForm = {
  ...createDefaultFormObj(),
  width: 100,
  depth: 80,
  height: 60,
  seed: 1234
};

const fieldChecksum = (field: Float32Array): number => {
  let h = 2166136261;
  for (let i = 0; i < field.length; i++) {
    h ^= field[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const REF_CROSS_CHECKSUM = 2957410369;
const REF_PARALLEL_CHECKSUM = 579537886;

const benchPattern = (name: string, buildGrid: (res: number) => Float32Array, res: number, runs: number) => {
  let field: Float32Array | null = null;
  let ms = 0;
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    field = buildGrid(res);
    ms += performance.now() - t0;
  }
  return { name, ms: ms / runs, checksum: fieldChecksum(field!), samples: field!.length };
};

const crossGrid = (res: number) => {
  const form = { ...baseForm, type: 'crosshatch' as const, ...crosshatchPattern.fieldDefaults };
  return crosshatchPattern.buildPatternGrid!(form, res).field;
};

const parallelGrid = (res: number) => {
  const form = { ...baseForm, type: 'parallel' as const, ...parallelPattern.fieldDefaults };
  return parallelPattern.buildPatternGrid!(form, res).field;
};

const crossGeom = (res: number) => {
  const form = { ...baseForm, type: 'crosshatch' as const, ...crosshatchPattern.fieldDefaults };
  const t0 = performance.now();
  const positions = crosshatchPattern.buildGeometry!(form, res);
  return { ms: performance.now() - t0, tris: positions.length / 9 };
};

const parallelGeom = (res: number) => {
  const form = { ...baseForm, type: 'parallel' as const, ...parallelPattern.fieldDefaults };
  const t0 = performance.now();
  const positions = parallelPattern.buildGeometry!(form, res);
  return { ms: performance.now() - t0, tris: positions.length / 9 };
};

const res = 72;
crossGrid(res);
parallelGrid(res);

const crossField = benchPattern('crosshatch-field', crossGrid, res, 10);
const parallelField = benchPattern('parallel-field', parallelGrid, res, 10);

let crossGeomMs = 0;
let parallelGeomMs = 0;
for (let i = 0; i < 5; i++) {
  crossGeomMs += crossGeom(res).ms;
  parallelGeomMs += parallelGeom(res).ms;
}

console.log(`${crossField.name} res${res}: ${crossField.ms.toFixed(1)}ms checksum=${crossField.checksum} samples=${crossField.samples}`);
console.log(`${parallelField.name} res${res}: ${parallelField.ms.toFixed(1)}ms checksum=${parallelField.checksum} samples=${parallelField.samples}`);
console.log(`crosshatch-geom res${res}: ${(crossGeomMs / 5).toFixed(1)}ms`);
console.log(`parallel-geom res${res}: ${(parallelGeomMs / 5).toFixed(1)}ms`);

if (crossField.checksum !== REF_CROSS_CHECKSUM) throw new Error(`FAIL: crosshatch checksum ${crossField.checksum} != ${REF_CROSS_CHECKSUM}`);
if (parallelField.checksum !== REF_PARALLEL_CHECKSUM) throw new Error(`FAIL: parallel checksum ${parallelField.checksum} != ${REF_PARALLEL_CHECKSUM}`);
console.log('OK: checksums match reference');
